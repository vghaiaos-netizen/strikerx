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
    stakeStriker,   // legacy alias kept for backwards compat
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

// ── Synthetic candle generator (fallback when live data unavailable) ─────────
function generateSyntheticCandles(
  symbol: string,
  currentPrice: number,
  interval: string,
  limit: number,
): { time: number; open: number; high: number; low: number; close: number; volume: number }[] {
  const intervalSecs = ({ "1m": 60, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600 } as Record<string, number>)[interval] ?? 60;
  // Per-candle absolute volatility (realistic for each asset class)
  const vol = ({
    EURUSD: 0.0004, GBPUSD: 0.0006, USDJPY: 0.08, AUDUSD: 0.0005, USDCHF: 0.0004,
    XAUUSD: 1.5, XAGUSD: 0.04, USOIL: 0.50, NATGAS: 0.008, COPPER: 0.006,
    BTC: 120, ETH: 8, SOL: 0.8, BNB: 1.2, TON: 0.02,
  } as Record<string, number>)[symbol] ?? currentPrice * 0.001;

  const now = Math.floor(Date.now() / 1000 / intervalSecs) * intervalSecs;

  // Walk backward from current price to build history
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
// Historical OHLC candles. Crypto → Binance REST. Forex/Commodities → Yahoo Finance.
// Falls back to synthetic candles if both live sources fail.
router.get("/trading/klines", async (req, res): Promise<void> => {
  const symbol   = String(req.query.symbol ?? "").toUpperCase().trim();
  const interval = String(req.query.interval ?? "1m");
  const limit    = Math.min(200, parseInt(String(req.query.limit ?? "100"), 10) || 100);

  if (!symbol) { res.status(400).json({ error: "symbol required" }); return; }

  const VALID_INTERVALS = ["1m", "5m", "15m", "30m", "1h"];
  if (!VALID_INTERVALS.includes(interval)) { res.status(400).json({ error: "invalid interval" }); return; }

  // Realistic seed prices for synthetic fallback (used when all live sources fail)
  const SEED_PRICES: Record<string, number> = {
    BTC: 107000, ETH: 2600, SOL: 175, BNB: 640, TON: 3.2,
    EURUSD: 1.085, GBPUSD: 1.27, USDJPY: 155, AUDUSD: 0.65, USDCHF: 0.90,
    XAUUSD: 2380, XAGUSD: 29.5, USOIL: 79, NATGAS: 2.2, COPPER: 4.5,
  };

  // ── Crypto: Binance REST → synthetic fallback ────────────────────────────
  const CRYPTO = ["BTC", "ETH", "SOL", "BNB", "TON"];
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

    // Use live price if available, else seed price — always return synthetic candles
    const currentPrice = getPrice(symbol) ?? SEED_PRICES[symbol] ?? null;
    const fallback = currentPrice
      ? generateSyntheticCandles(symbol, currentPrice, interval, limit)
      : [];
    res.json({ candles: fallback, synthetic: true });
    return;
  }

  // ── Forex / Commodity: Yahoo Finance then synthetic fallback ──────────────
  const YAHOO_MAP: Record<string, string> = {
    EURUSD: "EURUSD=X", GBPUSD: "GBPUSD=X", USDJPY: "USDJPY=X",
    AUDUSD: "AUDUSD=X", USDCHF: "USDCHF=X",
    XAUUSD: "GC=F", XAGUSD: "SI=F", USOIL: "CL=F", NATGAS: "NG=F", COPPER: "HG=F",
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
        // Detect flat candles (e.g. forex market closed on weekends — all OHLC identical)
        // Switch to synthetic so the chart has realistic movement
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

  // Synthetic fallback for forex/commodities when Yahoo is unreachable
  const currentPrice = getPrice(symbol) ?? SEED_PRICES[symbol] ?? null;
  const fallback = currentPrice
    ? generateSyntheticCandles(symbol, currentPrice, interval, limit)
    : [];
  res.json({ candles: fallback, synthetic: true });
});

export default router;
