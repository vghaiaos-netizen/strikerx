import { Router } from "express";
import { requireAuth } from "../lib/auth";
import { openPosition, getEnabledAssets, type ContractType, type TradingCurrency, type Direction } from "../lib/tradingEngine";
import { getPrice, getAllPrices, get24hChanges } from "../lib/binanceFeed";
import { db, tradingPositionsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { getConfig, getConfigFloat } from "../lib/configService";

const router = Router();

// ── GET /api/trading/assets ──────────────────────────────────────────────────
router.get("/trading/assets", async (_req, res): Promise<void> => {
  try {
    const assets = await getEnabledAssets();
    const prices = getAllPrices();
    res.json({
      assets: assets.map((a) => ({
        symbol:          a.symbol,
        displayName:     a.displayName,
        binanceSymbol:   a.binanceSymbol,
        payoutRatio:     parseFloat(String(a.payoutRatio)),
        minStakeStriker: parseFloat(String(a.minStakeStriker)),
        maxStakeStriker: parseFloat(String(a.maxStakeStriker)),
        minStakeTon:     parseFloat(String(a.minStakeTon ?? 0.1)),
        maxStakeTon:     parseFloat(String(a.maxStakeTon ?? 500)),
        currentPrice:    prices[a.symbol] ?? null,
      })),
    });
  } catch (err) {
    logger.error({ err }, "GET /trading/assets failed");
    res.status(500).json({ error: "Failed to fetch assets" });
  }
});

// ── GET /api/trading/prices ──────────────────────────────────────────────────
router.get("/trading/prices", (_req, res): void => {
  res.json({ prices: getAllPrices(), changes24h: get24hChanges(), at: Date.now() });
});

// ── POST /api/trading/positions ──────────────────────────────────────────────
router.post("/trading/positions", requireAuth, async (req, res): Promise<void> => {
  const {
    assetSymbol,
    direction,
    stakeStriker,
    stake,
    currency        = "TON",
    contractType    = "UP_DOWN",
    contractDurationSecs,
  } = req.body ?? {};

  const stakeAmount = typeof stake === "number" ? stake : (typeof stakeStriker === "number" ? stakeStriker : NaN);

  const VALID_CONTRACT_TYPES: ContractType[] = ["UP_DOWN", "EVEN_ODD", "OVER_UNDER", "IN_OUT"];
  const VALID_CURRENCIES:     TradingCurrency[] = ["TON", "USDT", "STRIKER"];
  const VALID_DIRECTIONS:     Direction[] = ["UP", "DOWN", "EVEN", "ODD", "OVER", "UNDER", "IN", "OUT"];

  if (typeof assetSymbol !== "string" || assetSymbol.length < 2 || assetSymbol.length > 10) {
    res.status(400).json({ error: "Invalid assetSymbol" }); return;
  }
  if (!VALID_DIRECTIONS.includes(direction)) {
    res.status(400).json({ error: `direction must be one of: ${VALID_DIRECTIONS.join(", ")}` }); return;
  }
  if (!VALID_CONTRACT_TYPES.includes(contractType)) {
    res.status(400).json({ error: `contractType must be one of: ${VALID_CONTRACT_TYPES.join(", ")}` }); return;
  }
  if (!VALID_CURRENCIES.includes(currency)) {
    res.status(400).json({ error: `currency must be one of: ${VALID_CURRENCIES.join(", ")}` }); return;
  }
  if (isNaN(stakeAmount) || stakeAmount <= 0) {
    res.status(400).json({ error: "stake must be a positive number" }); return;
  }
  if (typeof contractDurationSecs !== "number" || !Number.isInteger(contractDurationSecs) || contractDurationSecs <= 0) {
    res.status(400).json({ error: "contractDurationSecs must be a positive integer" }); return;
  }

  try {
    const playerId = req.player!.playerId;
    const result = await openPosition({
      playerId,
      assetSymbol: assetSymbol.toUpperCase(),
      direction:   direction.toUpperCase() as Direction,
      contractType,
      currency,
      stake:       stakeAmount,
      contractDurationSecs,
    });

    if (!result.success) { res.status(400).json({ error: result.error }); return; }

    req.log.info({ playerId, assetSymbol, direction, contractType, currency, stake: stakeAmount, positionId: result.positionId }, "Trade opened");
    res.status(201).json({
      positionId:   result.positionId,
      entryPrice:   result.entryPrice,
      expiresAt:    result.expiresAt.toISOString(),
      lowerBarrier: result.lowerBarrier,
      upperBarrier: result.upperBarrier,
    });
  } catch (err) {
    logger.error({ err }, "POST /trading/positions failed");
    res.status(500).json({ error: "Failed to open position" });
  }
});

// ── Shared position serialiser ────────────────────────────────────────────────
function serializePosition(p: typeof tradingPositionsTable.$inferSelect) {
  return {
    id:                   p.id,
    assetSymbol:          p.assetSymbol,
    direction:            p.direction,
    contractType:         p.contractType ?? "UP_DOWN",
    currency:             p.currency ?? "TON",
    stakeStriker:         parseFloat(String(p.stakeStriker)),
    entryPrice:           parseFloat(String(p.entryPrice)),
    exitPrice:            p.exitPrice != null ? parseFloat(String(p.exitPrice)) : null,
    lowerBarrier:         p.lowerBarrier != null ? parseFloat(String(p.lowerBarrier)) : null,
    upperBarrier:         p.upperBarrier != null ? parseFloat(String(p.upperBarrier)) : null,
    payoutRatio:          parseFloat(String(p.payoutRatio)),
    winAmount:            parseFloat(String(p.winAmount)),
    outcome:              p.outcome,
    contractDurationSecs: p.contractDurationSecs,
    expiresAt:            p.expiresAt.toISOString(),
    settledAt:            p.settledAt?.toISOString() ?? null,
    createdAt:            p.createdAt.toISOString(),
  };
}

// ── GET /api/trading/positions/active ───────────────────────────────────────
router.get("/trading/positions/active", requireAuth, async (req, res): Promise<void> => {
  try {
    const playerId  = req.player!.playerId;
    const positions = await db
      .select()
      .from(tradingPositionsTable)
      .where(and(eq(tradingPositionsTable.playerId, playerId), eq(tradingPositionsTable.outcome, "pending")))
      .orderBy(desc(tradingPositionsTable.expiresAt));
    res.json({ positions: positions.map(serializePosition) });
  } catch (err) {
    logger.error({ err }, "GET /trading/positions/active failed");
    res.status(500).json({ error: "Failed to fetch active positions" });
  }
});

// ── GET /api/trading/positions ──────────────────────────────────────────────
router.get("/trading/positions", requireAuth, async (req, res): Promise<void> => {
  try {
    const playerId  = req.player!.playerId;
    const positions = await db
      .select()
      .from(tradingPositionsTable)
      .where(eq(tradingPositionsTable.playerId, playerId))
      .orderBy(desc(tradingPositionsTable.createdAt))
      .limit(50);
    res.json({ positions: positions.map(serializePosition) });
  } catch (err) {
    logger.error({ err }, "GET /trading/positions failed");
    res.status(500).json({ error: "Failed to fetch positions" });
  }
});

// ── GET /api/trading/positions/:id ──────────────────────────────────────────
router.get("/trading/positions/:id", requireAuth, async (req, res): Promise<void> => {
  const positionId = parseInt(String(req.params.id), 10);
  if (isNaN(positionId)) { res.status(400).json({ error: "Invalid position ID" }); return; }
  try {
    const playerId  = req.player!.playerId;
    const [position] = await db
      .select()
      .from(tradingPositionsTable)
      .where(and(eq(tradingPositionsTable.id, positionId), eq(tradingPositionsTable.playerId, playerId)));
    if (!position) { res.status(404).json({ error: "Position not found" }); return; }
    res.json(serializePosition(position));
  } catch (err) {
    logger.error({ err }, "GET /trading/positions/:id failed");
    res.status(500).json({ error: "Failed to fetch position" });
  }
});

// ── GET /api/trading/config ──────────────────────────────────────────────────
router.get("/trading/config", async (_req, res): Promise<void> => {
  try {
    const [enabled, availableDurationsRaw, defaultDuration, payoutRatio, minStake, maxStake, minStakeTon, maxStakeTon, inOutSpread] =
      await Promise.all([
        getConfig("trading_enabled"),
        getConfig("trading_available_durations"),
        getConfigFloat("trading_default_duration", 60),
        getConfigFloat("trading_global_payout_ratio", 1.82),
        getConfigFloat("trading_min_stake", 10),
        getConfigFloat("trading_max_stake", 10000),
        getConfigFloat("trading_min_stake_ton", 0.1),
        getConfigFloat("trading_max_stake_ton", 500),
        getConfigFloat("trading_inout_spread", 0.5),
      ]);

    const availableDurations = (availableDurationsRaw ?? "30,60,300,900")
      .split(",").map((d) => parseInt(d.trim(), 10)).filter((d) => !isNaN(d) && d > 0);

    res.json({
      enabled: enabled !== "false",
      availableDurations,
      defaultDuration: Math.round(defaultDuration),
      payoutRatio,
      minStake:    Math.round(minStake),
      maxStake:    Math.round(maxStake),
      minStakeTon,
      maxStakeTon,
      inOutSpread,
    });
  } catch (err) {
    logger.error({ err }, "GET /trading/config failed");
    res.status(500).json({ error: "Failed to fetch trading config" });
  }
});

// ── POST /api/trading/ai-signal ──────────────────────────────────────────────
// Calls Groq (Llama 3.3 70B) via the key pool to generate a structured AI market signal.
// Returns: { signal, confidence, reasoning, bias, keyLevel, momentum }
// Key pool: reads GROQ_API_KEY_1…GROQ_API_KEY_5 (env vars). Add keys in Railway dashboard.
router.post("/trading/ai-signal", async (req, res): Promise<void> => {
  const { symbol, currentPrice, change24h, recentPrices, interval } = req.body ?? {};
  const tf = typeof interval === "string" && ["1m","5m","15m","30m","1h"].includes(interval) ? interval : "1m";
  const tfLabels: Record<string,string> = { "1m":"1-minute","5m":"5-minute","15m":"15-minute","30m":"30-minute","1h":"1-hour" };

  if (typeof symbol !== "string" || !symbol) {
    res.status(400).json({ error: "symbol required" }); return;
  }

  const { chatCompletion, getGroqPoolStatus } = await import("../lib/groqPool.js");
  const poolStatus = getGroqPoolStatus();
  if (poolStatus.keyCount === 0) {
    res.status(503).json({ error: "AI signal service not configured — set GROQ_API_KEY_1 in env vars" }); return;
  }
  if (poolStatus.available === 0) {
    res.status(503).json({ error: "AI signal service temporarily rate-limited — try again in 60s" }); return;
  }

  const price  = typeof currentPrice === "number" ? currentPrice : getPrice(symbol.toUpperCase());
  const chg24h = typeof change24h    === "number" ? change24h    : 0;
  const prices = Array.isArray(recentPrices) ? recentPrices.slice(-20) : [];

  const priceContext = prices.length > 0
    ? `Recent price series (newest last): [${prices.map((p: number) => p.toFixed ? p.toFixed(4) : p).join(", ")}]`
    : `Current price: ${price ?? "unknown"}`;

  const systemPrompt = `You are a professional binary options market analyst for StrikerX, a crypto and financial trading platform.
Analyze the provided market data and give a precise, actionable trading signal in JSON format.
Be concise and professional. Base your analysis on price action, momentum, and market context.
Always respond with valid JSON only — no markdown, no explanation outside the JSON.`;

  const userPrompt = `Analyze ${symbol.toUpperCase()} for a binary UP/DOWN trade signal on the ${tfLabels[tf]} timeframe.

Asset: ${symbol.toUpperCase()}
Chart Interval: ${tf}
${priceContext}
24h Change: ${chg24h >= 0 ? "+" : ""}${chg24h.toFixed(2)}%

This is a ${tfLabels[tf]} binary options signal — predict direction for the next ${tf} candle close.
Shorter timeframes (1m, 5m) should have lower max confidence (cap at 80).
Longer timeframes (30m, 1h) may warrant higher confidence.

Provide a JSON response with exactly these fields:
{
  "signal": "UP" or "DOWN",
  "confidence": number 50-90 (integer, lower for shorter timeframes),
  "bias": "BULLISH" | "BEARISH" | "NEUTRAL",
  "reasoning": "2-3 sentences referencing the ${tf} timeframe and price action",
  "momentum": "STRONG" | "MODERATE" | "WEAK",
  "timeframe": "${tf}",
  "keyLevel": number (nearest significant support/resistance price level)
}`;

  try {
    const { content, keySlot } = await chatCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt   },
      ],
      { temperature: 0.3, max_tokens: 300, response_format: { type: "json_object" } },
    );
    logger.info({ symbol, keySlot }, "Groq AI signal fetched via key pool");

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content) as Record<string, unknown>;
    } catch {
      logger.warn({ content }, "Failed to parse Groq JSON response");
      res.status(502).json({ error: "Invalid AI response format" }); return;
    }

    const signal = String(parsed.signal ?? "UP").toUpperCase() === "DOWN" ? "DOWN" : "UP";
    const confidence = Math.min(95, Math.max(50, parseInt(String(parsed.confidence ?? 60), 10)));
    const bias = ["BULLISH", "BEARISH", "NEUTRAL"].includes(String(parsed.bias ?? ""))
      ? String(parsed.bias) : signal === "UP" ? "BULLISH" : "BEARISH";
    const momentum = ["STRONG", "MODERATE", "WEAK"].includes(String(parsed.momentum ?? ""))
      ? String(parsed.momentum) : "MODERATE";

    res.json({
      symbol:     symbol.toUpperCase(),
      signal,
      confidence,
      bias,
      momentum,
      reasoning:  String(parsed.reasoning ?? "Market analysis in progress."),
      keyLevel:   typeof parsed.keyLevel === "number" ? parsed.keyLevel : null,
      timeframe:  tf,
      generatedAt: Date.now(),
    });

    logger.info({ symbol, signal, confidence, timeframe: tf }, "AI signal generated (Groq)");
  } catch (err) {
    logger.error({ err }, "Groq AI signal request failed");
    res.status(502).json({ error: "AI signal service unavailable" });
  }
});

// ── Synthetic candle generator (fallback when live data unavailable) ─────────
function generateSyntheticCandles(
  symbol: string,
  currentPrice: number,
  interval: string,
  limit: number,
): { time: number; open: number; high: number; low: number; close: number; volume: number }[] {
  const intervalSecs = ({ "1m": 60, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600 } as Record<string, number>)[interval] ?? 60;
  const vol = ({
    EURUSD: 0.0004, GBPUSD: 0.0006, USDJPY: 0.08, AUDUSD: 0.0005, USDCHF: 0.0004,
    XAUUSD: 1.5, XAGUSD: 0.04, USOIL: 0.50, NATGAS: 0.008, COPPER: 0.006,
    BTC: 120, ETH: 8, SOL: 0.8, BNB: 1.2, TON: 0.02,
    XRP: 0.002, DOGE: 0.0005, AVAX: 0.15, MATIC: 0.003,
    SPX: 8, NDX: 15, DAX: 20, FTSE: 15, NKY: 80, DJI: 50,
  } as Record<string, number>)[symbol] ?? currentPrice * 0.001;

  const now = Math.floor(Date.now() / 1000 / intervalSecs) * intervalSecs;

  const closes: number[] = [currentPrice];
  for (let i = 1; i < limit; i++) {
    const prev   = closes[closes.length - 1];
    const change = vol * (Math.random() * 2 - 1);
    closes.push(Math.max(prev * 0.9, prev + change));
  }
  closes.reverse();

  return closes.map((close, i) => {
    const open    = i === 0 ? closes[0] * (1 + 0.0002 * (Math.random() - 0.5)) : closes[i - 1];
    const wick    = vol * Math.random() * 0.5;
    return {
      time:   now - (limit - 1 - i) * intervalSecs,
      open,
      high:   Math.max(open, close) + wick,
      low:    Math.min(open, close) - wick,
      close,
      volume: 0,
    };
  });
}

// ── GET /api/trading/klines ──────────────────────────────────────────────────
// Historical OHLC candles. Crypto → Binance REST. Forex/Commodities/Indices → Yahoo Finance.
// Falls back to synthetic candles if both live sources fail.
router.get("/trading/klines", async (req, res): Promise<void> => {
  const symbol   = String(req.query.symbol ?? "").toUpperCase().trim();
  const interval = String(req.query.interval ?? "1m");
  const limit    = Math.min(200, parseInt(String(req.query.limit ?? "100"), 10) || 100);

  if (!symbol) { res.status(400).json({ error: "symbol required" }); return; }

  const VALID_INTERVALS = ["1m", "5m", "15m", "30m", "1h"];
  if (!VALID_INTERVALS.includes(interval)) { res.status(400).json({ error: "invalid interval" }); return; }

  const SEED_PRICES: Record<string, number> = {
    BTC: 107000, ETH: 2600, SOL: 175, BNB: 640, TON: 3.2,
    XRP: 0.62, DOGE: 0.17, AVAX: 28, MATIC: 0.55,
    EURUSD: 1.085, GBPUSD: 1.27, USDJPY: 155, AUDUSD: 0.65, USDCHF: 0.90,
    XAUUSD: 2380, XAGUSD: 29.5, USOIL: 79, NATGAS: 2.2, COPPER: 4.5,
    SPX: 5300, NDX: 18500, DAX: 18200, FTSE: 8200, NKY: 38000, DJI: 39500,
  };

  // ── Crypto: Binance REST → synthetic fallback ────────────────────────────
  const CRYPTO = ["BTC", "ETH", "SOL", "BNB", "TON", "XRP", "DOGE", "AVAX", "MATIC"];
  if (CRYPTO.includes(symbol)) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=${interval}&limit=${limit}`;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(6_000) });
      if (!r.ok) throw new Error(`Binance HTTP ${r.status}`);
      const raw = await r.json() as unknown[];
      const candles = (raw as string[][]).map((c) => ({
        time:   Math.floor(Number(c[0]) / 1000),
        open:   parseFloat(c[1]),
        high:   parseFloat(c[2]),
        low:    parseFloat(c[3]),
        close:  parseFloat(c[4]),
        volume: parseFloat(c[5]) || 0,
      })).filter((c) => c.open > 0 && !isNaN(c.open));
      if (candles.length > 0) { res.json({ candles }); return; }
    } catch { /* fall through to synthetic */ }

    const currentPrice = getPrice(symbol) ?? SEED_PRICES[symbol] ?? null;
    const fallback = currentPrice
      ? generateSyntheticCandles(symbol, currentPrice, interval, limit)
      : [];
    res.json({ candles: fallback, synthetic: true });
    return;
  }

  // ── Forex / Commodity / Index: Yahoo Finance → synthetic fallback ─────────
  const YAHOO_MAP: Record<string, string> = {
    EURUSD: "EURUSD=X", GBPUSD: "GBPUSD=X", USDJPY: "USDJPY=X",
    AUDUSD: "AUDUSD=X", USDCHF: "USDCHF=X",
    XAUUSD: "GC=F", XAGUSD: "SI=F", USOIL: "CL=F", NATGAS: "NG=F", COPPER: "HG=F",
    SPX: "^GSPC", NDX: "^NDX", DAX: "^GDAXI", FTSE: "^FTSE", NKY: "^N225", DJI: "^DJI",
  };
  const yahooSymbol = YAHOO_MAP[symbol];
  if (!yahooSymbol) { res.json({ candles: [] }); return; }

  const RANGE_MAP: Record<string, string[]> = {
    "1m":  ["1d", "5d"],
    "5m":  ["5d", "1mo"],
    "15m": ["1mo", "3mo"],
    "30m": ["1mo", "3mo"],
    "1h":  ["3mo", "6mo"],
  };
  const ranges = RANGE_MAP[interval] ?? ["1d"];

  for (const range of ranges) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${interval}&range=${range}`;
    try {
      const r = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/json",
        },
        signal: AbortSignal.timeout(6_000),
      });
      if (!r.ok) continue;
      const json = await r.json() as { chart?: { result?: { timestamp?: number[]; indicators?: { quote?: { open?: (number|null)[]; high?: (number|null)[]; low?: (number|null)[]; close?: (number|null)[]; volume?: (number|null)[] }[] } }[] } };
      const result = json?.chart?.result?.[0];
      if (!result) continue;

      const timestamps = result.timestamp ?? [];
      const q          = result.indicators?.quote?.[0] ?? {};
      const opens      = q.open   ?? [];
      const highs      = q.high   ?? [];
      const lows       = q.low    ?? [];
      const closes     = q.close  ?? [];
      const volumes    = q.volume ?? [];

      const seen = new Set<number>();
      const candles = timestamps
        .map((t, i) => ({ time: t, open: opens[i], high: highs[i], low: lows[i], close: closes[i], volume: volumes[i] ?? 0 }))
        .filter((c) =>
          c.open  != null && c.high  != null && c.low  != null && c.close != null &&
          isFinite(c.open!) && isFinite(c.high!) && isFinite(c.low!) && isFinite(c.close!) &&
          c.open! > 0 && !seen.has(c.time) && seen.add(c.time)
        )
        .slice(-limit) as { time: number; open: number; high: number; low: number; close: number; volume: number }[];

      if (candles.length > 0) {
        const hasVariance = candles.some((c) => c.high > c.low || c.open !== c.close);
        if (!hasVariance) {
          const basePrice = candles[candles.length - 1]?.close ?? (getPrice(symbol) ?? SEED_PRICES[symbol] ?? null);
          if (basePrice) {
            res.json({ candles: generateSyntheticCandles(symbol, basePrice, interval, limit), synthetic: true });
            return;
          }
        }
        res.json({ candles });
        return;
      }
    } catch { /* try next range */ }
  }

  // Synthetic fallback when all live sources fail
  const currentPrice = getPrice(symbol) ?? SEED_PRICES[symbol] ?? null;
  const fallback = currentPrice
    ? generateSyntheticCandles(symbol, currentPrice, interval, limit)
    : [];
  res.json({ candles: fallback, synthetic: true });
});

// ── Auto-Trade Config ────────────────────────────────────────────────────────

router.get("/trading/auto-trade/config", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  try {
    const { getAutoTradeConfig } = await import("../lib/autoTrader.js");
    const cfg = await getAutoTradeConfig(playerId);
    if (!cfg) {
      res.json({ enabled: false, riskPreset: "balanced", assetSymbol: "BTCUSDT", interval: "5m", currency: "STRIKER" });
      return;
    }
    res.json({
      enabled:     cfg.enabled,
      riskPreset:  cfg.risk_level ?? "balanced",
      assetSymbol: cfg.asset_symbol,
      interval:    cfg.interval,
      currency:    cfg.currency,
    });
  } catch (err) {
    req.log.error({ err }, "auto-trade config GET failed");
    res.status(500).json({ error: "Failed to load config" });
  }
});

router.put("/trading/auto-trade/config", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  const { enabled, riskPreset = "balanced", assetSymbol = "BTCUSDT", interval = "5m", currency = "STRIKER" } = req.body as {
    enabled: boolean;
    riskPreset?: "conservative" | "balanced" | "aggressive";
    assetSymbol?: string;
    interval?: string;
    currency?: string;
  };
  try {
    const { upsertAutoTradeConfig, RISK_PRESETS } = await import("../lib/autoTrader.js");
    const preset = RISK_PRESETS[riskPreset] ?? RISK_PRESETS.balanced;
    await upsertAutoTradeConfig(playerId, {
      enabled,
      asset_symbol:       assetSymbol,
      interval,
      max_stake_pct:      preset.maxStakePct,
      max_trades_per_day: preset.maxTradesPerDay,
      currency,
      risk_level:         riskPreset,
      min_confidence:     preset.minConfidence,
    });
    res.json({ ok: true, enabled, riskPreset });
  } catch (err) {
    req.log.error({ err }, "auto-trade config PUT failed");
    res.status(500).json({ error: "Failed to save config" });
  }
});

export default router;
