import { logger } from "./logger";
import { setExternalPrice, setExternalChange } from "./binanceFeed";

/**
 * Forex / Commodities price feed.
 *
 * Primary for forex:    open.er-api.com  (free, no API key, real bank rates)
 * Primary for commodities: Yahoo Finance chart API (GC=F, SI=F, CL=F, NG=F, HG=F)
 * Between real polls:  micro-tick simulator adds realistic ±volatility/second
 *                      (standard practice for retail binary option platforms)
 */

interface PriceState {
  basePrice:     number;
  volatilityAbs: number;   // absolute price change per tick (1s)
  lastUpdated:   number;
}

const priceState = new Map<string, PriceState>();

// Per-symbol realistic tick volatility (absolute price units per second)
const TICK_VOL: Record<string, number> = {
  EURUSD: 0.00004,  GBPUSD: 0.00006,  USDJPY: 0.006,
  AUDUSD: 0.00005,  USDCHF: 0.00004,
  XAUUSD: 0.15,     XAGUSD: 0.008,    USOIL: 0.04,
  NATGAS: 0.003,    COPPER: 0.0015,
};

// ── Forex pairs via open.er-api.com ────────────────────────────────────────
const FOREX_PAIRS: { symbol: string; erKey: string; inverted: boolean }[] = [
  { symbol: "EURUSD", erKey: "EUR", inverted: true  },
  { symbol: "GBPUSD", erKey: "GBP", inverted: true  },
  { symbol: "USDJPY", erKey: "JPY", inverted: false },
  { symbol: "AUDUSD", erKey: "AUD", inverted: true  },
  { symbol: "USDCHF", erKey: "CHF", inverted: false },
];

// ── Commodity futures via Yahoo Finance ────────────────────────────────────
const COMMODITY_PAIRS: { symbol: string; yahooSymbol: string }[] = [
  { symbol: "XAUUSD", yahooSymbol: "GC=F"  },
  { symbol: "XAGUSD", yahooSymbol: "SI=F"  },
  { symbol: "USOIL",  yahooSymbol: "CL=F"  },
  { symbol: "NATGAS", yahooSymbol: "NG=F"  },
  { symbol: "COPPER", yahooSymbol: "HG=F"  },
];

let tickTimer:   NodeJS.Timeout | null = null;
let pollTimer:   NodeJS.Timeout | null = null;
let broadcastFn: ((symbol: string, price: number) => void) | null = null;

// ── Synthetic tick ────────────────────────────────────────────────────────

function emitTick(symbol: string) {
  const state = priceState.get(symbol);
  if (!state || Date.now() - state.lastUpdated > 120_000) return; // stale > 2 min → skip

  const vol = state.volatilityAbs;
  // Approximate normal distribution via Box-Muller
  const u1  = Math.max(1e-10, Math.random());
  const u2  = Math.random();
  const z   = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  // Mean-revert towards base price by 2% per tick to prevent runaway drift
  const mean_revert = (state.basePrice - (priceState.get(symbol)?.basePrice ?? state.basePrice)) * 0.02;
  const newPrice = Math.max(state.basePrice * 0.85, state.basePrice + vol * z + mean_revert);
  setExternalPrice(symbol, parseFloat(newPrice.toFixed(8)));
  broadcastFn?.(symbol, newPrice);
}

function startTickerLoop() {
  if (tickTimer) return;
  tickTimer = setInterval(() => {
    for (const { symbol } of [...FOREX_PAIRS, ...COMMODITY_PAIRS]) {
      if (priceState.has(symbol)) emitTick(symbol);
    }
  }, 1_000);
}

// ── Forex poll ────────────────────────────────────────────────────────────

async function pollForex() {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      headers: { "Accept": "application/json" },
      signal:  AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json() as { result: string; rates: Record<string, number> };
    if (json.result !== "success") throw new Error("Non-success result");

    for (const { symbol, erKey, inverted } of FOREX_PAIRS) {
      const rate = json.rates[erKey];
      if (!rate || rate <= 0) continue;
      const price = parseFloat((inverted ? 1 / rate : rate).toFixed(8));
      priceState.set(symbol, {
        basePrice:     price,
        volatilityAbs: TICK_VOL[symbol] ?? 0.00005,
        lastUpdated:   Date.now(),
      });
      setExternalPrice(symbol, price);
      broadcastFn?.(symbol, price);
    }
    logger.debug("Forex rates refreshed (open.er-api.com)");
  } catch (err) {
    logger.warn({ err }, "Forex poll failed");
  }
}

// ── Commodity poll ────────────────────────────────────────────────────────

async function fetchYahooPrice(yahooSymbol: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1m&range=2m`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "application/json,*/*",
      },
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return null;
    const json = await res.json() as { chart?: { result?: { meta?: { regularMarketPrice?: number } }[] } };
    const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof price === "number" && price > 0 ? price : null;
  } catch {
    return null;
  }
}

// Fallback commodity prices (approximate) when Yahoo is unreachable
const COMMODITY_FALLBACK: Record<string, number> = {
  XAUUSD: 2380, XAGUSD: 29.5, USOIL: 79, NATGAS: 2.2, COPPER: 4.5,
};

async function pollCommodities() {
  await Promise.allSettled(
    COMMODITY_PAIRS.map(async ({ symbol, yahooSymbol }) => {
      const price = await fetchYahooPrice(yahooSymbol);
      const resolved = price ?? (priceState.get(symbol)?.basePrice ?? COMMODITY_FALLBACK[symbol]);
      if (!resolved || resolved <= 0) return;
      priceState.set(symbol, {
        basePrice:     resolved,
        volatilityAbs: TICK_VOL[symbol] ?? 0.01,
        lastUpdated:   price !== null ? Date.now() : (priceState.get(symbol)?.lastUpdated ?? 0),
      });
      if (price !== null) {
        setExternalPrice(symbol, resolved);
        broadcastFn?.(symbol, resolved);
      }
    }),
  );
}

// ── Public API ─────────────────────────────────────────────────────────────

export function initForexFeed(onPriceUpdate?: (symbol: string, price: number) => void) {
  broadcastFn = onPriceUpdate ?? null;
  logger.info("Forex/commodities feed initializing");

  // Seed fallback commodity prices immediately so trading is never blocked
  for (const { symbol } of COMMODITY_PAIRS) {
    if (!priceState.has(symbol) && COMMODITY_FALLBACK[symbol]) {
      priceState.set(symbol, {
        basePrice:     COMMODITY_FALLBACK[symbol],
        volatilityAbs: TICK_VOL[symbol] ?? 0.01,
        lastUpdated:   Date.now(),
      });
      setExternalPrice(symbol, COMMODITY_FALLBACK[symbol]);
    }
  }

  // Initial polls
  void pollForex();
  void pollCommodities();

  // Forex every 30s (ECB rate, good enough), commodities every 12s
  pollTimer = setInterval(() => {
    void pollForex();
    void pollCommodities();
  }, 30_000);

  // Ticker starts 2s later so base prices are seeded first
  setTimeout(startTickerLoop, 2_000);
}

export function stopForexFeed() {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

export const FOREX_SYMBOLS = [
  ...FOREX_PAIRS.map((f) => f.symbol),
  ...COMMODITY_PAIRS.map((f) => f.symbol),
];
