/**
 * autoTrader.ts — Autonomous AI Trading Service
 *
 * Runs on a 60-second scheduler. For each enabled auto_trade_config:
 *   1. Requires ≥ 5 completed real trades before activation (learning gate)
 *   2. Fetches an AI signal from Groq via the key pool
 *   3. If confidence ≥ player's threshold: opens a position automatically
 *   4. Respects daily trade caps and never stacks positions on the same asset
 *
 * Tables (created via index.ts migrations):
 *   auto_trade_configs  — one row per player (unique on player_id)
 *   auto_trade_log      — immutable audit log of every AI-initiated action
 */

import { db, playersTable, pool } from "@workspace/db";
import { eq } from "drizzle-orm";
import { chatCompletion } from "./groqPool.js";
import { openPosition } from "./tradingEngine.js";
import { getPrice } from "./binanceFeed.js";
import { logger as rootLogger } from "./logger.js";

const logger = rootLogger.child({ module: "auto-trader" });

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AutoTradeConfig {
  id:                  number;
  player_id:           number;
  enabled:             boolean;
  asset_symbol:        string;
  interval:            string;          // "1m" | "5m" | "15m" | "30m" | "1h"
  max_stake_pct:       number;          // fraction of balance (0.02 = 2%)
  max_trades_per_day:  number;
  currency:            string;          // TON | USDT | STRIKER
  risk_level:          string;          // conservative | balanced | aggressive
  min_confidence:      number;          // 50–95; trade only if signal >= this
  trades_today:        number;
  last_trade_at:       Date | null;
  total_auto_trades:   number;
  total_auto_wins:     number;
  reset_date:          string | null;   // "YYYY-MM-DD" of last daily reset
  created_at:          Date;
  updated_at:          Date;
}

export interface AutoTradeLogEntry {
  id:           number;
  config_id:    number;
  player_id:    number;
  asset_symbol: string;
  direction:    string;
  stake:        number;
  currency:     string;
  confidence:   number;
  position_id:  number | null;
  status:       string;   // opened | failed | skipped
  note:         string;
  created_at:   Date;
}

// Risk-level presets — sensible defaults for each level
export const RISK_PRESETS: Record<string, { maxStakePct: number; minConfidence: number; maxTradesPerDay: number }> = {
  conservative: { maxStakePct: 0.02, minConfidence: 80, maxTradesPerDay: 5  },
  balanced:     { maxStakePct: 0.05, minConfidence: 70, maxTradesPerDay: 10 },
  aggressive:   { maxStakePct: 0.10, minConfidence: 60, maxTradesPerDay: 20 },
};

// Interval → contract duration mapping
const INTERVAL_DURATION: Record<string, number> = {
  "1m": 60, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600,
};

// Interval → human label for AI prompt
const INTERVAL_LABEL: Record<string, string> = {
  "1m": "1-minute", "5m": "5-minute", "15m": "15-minute", "30m": "30-minute", "1h": "1-hour",
};

// ── DB helpers (raw pool — auto_trade_configs is not in Drizzle schema) ───────

async function getEnabledConfigs(): Promise<AutoTradeConfig[]> {
  const res = await pool.query<AutoTradeConfig>(
    `SELECT * FROM auto_trade_configs WHERE enabled = true`,
  );
  return res.rows;
}

async function countCompletedTrades(playerId: number): Promise<number> {
  const res = await pool.query<{ c: string }>(
    `SELECT COUNT(*) AS c FROM trading_positions WHERE player_id = $1 AND outcome != 'pending'`,
    [playerId],
  );
  return parseInt(res.rows[0]?.c ?? "0", 10);
}

async function hasActivePendingPosition(playerId: number, assetSymbol: string): Promise<boolean> {
  const res = await pool.query<{ c: string }>(
    `SELECT COUNT(*) AS c FROM trading_positions
     WHERE player_id = $1 AND asset_symbol = $2 AND outcome = 'pending'`,
    [playerId, assetSymbol],
  );
  return parseInt(res.rows[0]?.c ?? "0", 10) > 0;
}

async function resetDailyCounterIfNeeded(configId: number, today: string): Promise<void> {
  await pool.query(
    `UPDATE auto_trade_configs
     SET trades_today = 0, reset_date = $1, updated_at = NOW()
     WHERE id = $2 AND (reset_date IS NULL OR reset_date != $1)`,
    [today, configId],
  );
}

async function getTradestoday(configId: number): Promise<number> {
  const res = await pool.query<{ trades_today: number }>(
    `SELECT trades_today FROM auto_trade_configs WHERE id = $1`,
    [configId],
  );
  return res.rows[0]?.trades_today ?? 0;
}

async function incrementTradeCount(configId: number): Promise<void> {
  await pool.query(
    `UPDATE auto_trade_configs
     SET trades_today       = trades_today + 1,
         total_auto_trades  = total_auto_trades + 1,
         last_trade_at      = NOW(),
         updated_at         = NOW()
     WHERE id = $1`,
    [configId],
  );
}

async function logEntry(entry: {
  configId:    number;
  playerId:    number;
  assetSymbol: string;
  direction:   string;
  stake:       number;
  currency:    string;
  confidence:  number;
  positionId:  number | null;
  status:      string;
  note:        string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO auto_trade_log
       (config_id, player_id, asset_symbol, direction, stake, currency,
        confidence, position_id, status, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [entry.configId, entry.playerId, entry.assetSymbol, entry.direction,
     entry.stake, entry.currency, entry.confidence, entry.positionId,
     entry.status, entry.note],
  );
}

// ── AI signal (technical-context prompt for autonomous trading) ──────────────

async function getAiSignal(
  assetSymbol: string,
  currentPrice: number | null,
  interval: string,
  recentPrices: number[] = [],
): Promise<{ signal: "UP" | "DOWN"; confidence: number; reasoning: string } | null> {
  const tf = INTERVAL_LABEL[interval] ?? interval;

  // Build technical context from recent prices
  let techCtx = "";
  if (recentPrices.length >= 5) {
    const last  = recentPrices[recentPrices.length - 1]!;
    const prev4 = recentPrices[recentPrices.length - 5]!;
    const momentum = ((last - prev4) / prev4 * 100).toFixed(3);
    const ema9     = recentPrices.slice(-9).reduce((a, b) => a + b, 0) / Math.min(9, recentPrices.length);
    const aboveEma = last > ema9 ? "above" : "below";
    const upTicks  = recentPrices.slice(-10).reduce(
      (c, p, i, a) => i === 0 ? c : p > a[i - 1]! ? c + 1 : c, 0,
    );
    const maxP = Math.max(...recentPrices.slice(-20));
    const minP = Math.min(...recentPrices.slice(-20));
    const pctFromHigh = ((last - maxP) / maxP * 100).toFixed(2);
    const pctFromLow  = ((last - minP) / minP * 100).toFixed(2);
    techCtx = ` | 5-tick momentum: ${momentum}% | price ${aboveEma} EMA9 | up-ticks: ${upTicks}/9 | ${pctFromHigh}% from 20-tick high | ${pctFromLow}% from 20-tick low`;
  } else if (currentPrice != null) {
    techCtx = ` | current: ${currentPrice}`;
  }

  const systemPrompt =
    `You are an autonomous binary options signal engine for StrikerX. ` +
    `Your signals drive real money trades. Be conservative — only signal when technically justified. ` +
    `Respond ONLY with valid JSON. No markdown, no explanation outside JSON.`;

  const userPrompt =
    `Asset: ${assetSymbol} | Timeframe: ${tf}${techCtx}
Task: predict UP or DOWN for the next ${interval} candle close.
Rules: confidence 50–85 only (never higher — overconfidence loses money). Reasoning ≤20 words.
JSON: {"signal":"UP"|"DOWN","confidence":50-85,"reasoning":"≤20 words","momentum":"STRONG"|"MODERATE"|"WEAK"}`;

  try {
    const { content } = await chatCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt   },
      ],
      { temperature: 0.12, max_tokens: 100, response_format: { type: "json_object" } },
    );
    const parsed = JSON.parse(content) as {
      signal?:    string;
      confidence?: unknown;
      reasoning?:  string;
      momentum?:   string;
    };
    const sig = String(parsed.signal ?? "").toUpperCase();
    if (sig !== "UP" && sig !== "DOWN") return null;
    const conf = Math.min(85, Math.max(50, parseInt(String(parsed.confidence ?? 60), 10)));
    return {
      signal:    sig as "UP" | "DOWN",
      confidence: conf,
      reasoning: String(parsed.reasoning ?? "").slice(0, 200),
    };
  } catch {
    return null;
  }
}

// ── Main scheduler tick ───────────────────────────────────────────────────────

export async function runAutoTraderTick(): Promise<void> {
  let configs: AutoTradeConfig[];
  try {
    configs = await getEnabledConfigs();
  } catch (err) {
    logger.warn({ err }, "auto-trader: DB not ready");
    return;
  }
  if (configs.length === 0) return;

  const today = new Date().toISOString().slice(0, 10);

  for (const cfg of configs) {
    try {
      // 1. Reset daily counter if day rolled over
      await resetDailyCounterIfNeeded(cfg.id, today);
      const tradesToday = await getTradestoday(cfg.id);

      // 2. Daily cap
      if (tradesToday >= cfg.max_trades_per_day) continue;

      // 3. Minimum 5 completed real trades (learning gate)
      const completed = await countCompletedTrades(cfg.player_id);
      if (completed < 5) {
        logger.debug({ playerId: cfg.player_id, completed }, "auto-trader: needs ≥5 real trades first");
        continue;
      }

      // 4. No existing open position for this asset
      if (await hasActivePendingPosition(cfg.player_id, cfg.asset_symbol)) continue;

      // 5. AI signal
      const currentPrice = getPrice(cfg.asset_symbol.toUpperCase());
      const signal = await getAiSignal(cfg.asset_symbol, currentPrice, cfg.interval);
      if (!signal) {
        await logEntry({ configId: cfg.id, playerId: cfg.player_id, assetSymbol: cfg.asset_symbol,
          direction: "?", stake: 0, currency: cfg.currency, confidence: 0,
          positionId: null, status: "skipped", note: "Signal fetch failed" });
        continue;
      }

      // 6. Confidence gate
      if (signal.confidence < cfg.min_confidence) {
        logger.debug({ playerId: cfg.player_id, confidence: signal.confidence, min: cfg.min_confidence }, "auto-trader: confidence too low");
        continue;
      }

      // 7. Compute stake
      const [playerRow] = await db.select().from(playersTable).where(eq(playersTable.id, cfg.player_id));
      if (!playerRow) continue;

      const rawBalance =
        cfg.currency === "TON"    ? parseFloat(String(playerRow.tonBalance))
        : cfg.currency === "USDT" ? parseFloat(String(playerRow.usdtBalance))
                                  : parseFloat(String(playerRow.strikerBalance));

      const minStake = cfg.currency === "STRIKER" ? 10 : 0.1;
      const stake    = parseFloat((rawBalance * cfg.max_stake_pct).toFixed(cfg.currency === "STRIKER" ? 0 : 4));

      if (stake < minStake) {
        await logEntry({ configId: cfg.id, playerId: cfg.player_id, assetSymbol: cfg.asset_symbol,
          direction: signal.signal, stake, currency: cfg.currency, confidence: signal.confidence,
          positionId: null, status: "skipped", note: `Stake ${stake} below minimum ${minStake}` });
        continue;
      }

      // 8. Open position
      const result = await openPosition({
        playerId:             cfg.player_id,
        assetSymbol:          cfg.asset_symbol,
        direction:            signal.signal,
        contractType:         "UP_DOWN",
        currency:             cfg.currency as "TON" | "USDT" | "STRIKER",
        stake,
        contractDurationSecs: INTERVAL_DURATION[cfg.interval] ?? 60,
      });

      if (result.success) {
        await incrementTradeCount(cfg.id);
        await logEntry({
          configId:    cfg.id, playerId: cfg.player_id, assetSymbol: cfg.asset_symbol,
          direction:   signal.signal, stake, currency: cfg.currency,
          confidence:  signal.confidence, positionId: result.positionId,
          status:      "opened", note: signal.reasoning,
        });
        logger.info({ playerId: cfg.player_id, asset: cfg.asset_symbol, signal: signal.signal,
          confidence: signal.confidence, stake, positionId: result.positionId }, "auto-trade opened");
      } else {
        await logEntry({
          configId:    cfg.id, playerId: cfg.player_id, assetSymbol: cfg.asset_symbol,
          direction:   signal.signal, stake, currency: cfg.currency,
          confidence:  signal.confidence, positionId: null,
          status:      "failed", note: result.error,
        });
        logger.warn({ playerId: cfg.player_id, error: result.error }, "auto-trade open failed");
      }

    } catch (err) {
      logger.error({ err, playerId: cfg.player_id }, "auto-trader tick error for player");
    }
  }
}

// ── Public CRUD API (called by routes/trading.ts) ─────────────────────────────

export async function getAutoTradeConfig(playerId: number): Promise<AutoTradeConfig | null> {
  const res = await pool.query<AutoTradeConfig>(
    `SELECT * FROM auto_trade_configs WHERE player_id = $1`,
    [playerId],
  );
  return res.rows[0] ?? null;
}

export async function upsertAutoTradeConfig(
  playerId: number,
  cfg: {
    enabled:            boolean;
    asset_symbol:       string;
    interval:           string;
    max_stake_pct:      number;
    max_trades_per_day: number;
    currency:           string;
    risk_level:         string;
    min_confidence:     number;
  },
): Promise<AutoTradeConfig> {
  const res = await pool.query<AutoTradeConfig>(
    `INSERT INTO auto_trade_configs
       (player_id, enabled, asset_symbol, interval, max_stake_pct,
        max_trades_per_day, currency, risk_level, min_confidence)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (player_id) DO UPDATE SET
       enabled            = EXCLUDED.enabled,
       asset_symbol       = EXCLUDED.asset_symbol,
       interval           = EXCLUDED.interval,
       max_stake_pct      = EXCLUDED.max_stake_pct,
       max_trades_per_day = EXCLUDED.max_trades_per_day,
       currency           = EXCLUDED.currency,
       risk_level         = EXCLUDED.risk_level,
       min_confidence     = EXCLUDED.min_confidence,
       updated_at         = NOW()
     RETURNING *`,
    [playerId, cfg.enabled, cfg.asset_symbol, cfg.interval, cfg.max_stake_pct,
     cfg.max_trades_per_day, cfg.currency, cfg.risk_level, cfg.min_confidence],
  );
  return res.rows[0];
}

export async function disableAutoTrade(playerId: number): Promise<void> {
  await pool.query(
    `UPDATE auto_trade_configs SET enabled = false, updated_at = NOW() WHERE player_id = $1`,
    [playerId],
  );
}

export async function getAutoTradeLog(playerId: number, limit = 20): Promise<AutoTradeLogEntry[]> {
  const res = await pool.query<AutoTradeLogEntry>(
    `SELECT l.*, p.outcome AS position_outcome
     FROM auto_trade_log l
     LEFT JOIN trading_positions p ON p.id = l.position_id
     WHERE l.player_id = $1
     ORDER BY l.created_at DESC
     LIMIT $2`,
    [playerId, limit],
  );
  return res.rows;
}

// ── Scheduler entry point ─────────────────────────────────────────────────────

export function startAutoTraderScheduler(): void {
  logger.info("Auto-trader scheduler started (60s interval, 5-trade learning gate)");
  void runAutoTraderTick();
  setInterval(() => { void runAutoTraderTick(); }, 60_000);
}
