import { logger } from "./logger";

/**
 * Forex / Commodities price feed.
 * Polls Yahoo Finance unofficial chart API (no API key — server-side only).
 * Falls back gracefully when market is closed or symbol unavailable.
 */

interface FeedEntry {
  symbol: string;
  yahooSymbol: string;
}

const FEED_SYMBOLS: FeedEntry[] = [
  { symbol: "EURUSD", yahooSymbol: "EURUSD=X" },
  { symbol: "GBPUSD", yahooSymbol: "GBPUSD=X" },
  { symbol: "USDJPY", yahooSymbol: "USDJPY=X" },
  { symbol: "AUDUSD", yahooSymbol: "AUDUSD=X" },
  { symbol: "USDCHF", yahooSymbol: "USDCHF=X" },
  { symbol: "XAUUSD", yahooSymbol: "GC=F"     },
  { symbol: "XAGUSD", yahooSymbol: "SI=F"     },
  { symbol: "USOIL",  yahooSymbol: "CL=F"     },
  { symbol: "NATGAS", yahooSymbol: "NG=F"     },
  { symbol: "COPPER", yahooSymbol: "HG=F"     },
];

const POLL_INTERVAL_MS = 6_000;
const FETCH_TIMEOUT_MS = 5_000;

let pollTimer: NodeJS.Timeout | null = null;
let broadcastFn: ((symbol: string, price: number) => void) | null = null;
let staleCounters = new Map<string, number>();

async function fetchYahooPrice(yahooSymbol: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1m&range=2m`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible)" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await res.json() as any;
    const price: unknown = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof price === "number" && price > 0 ? price : null;
  } catch {
    return null;
  }
}

async function pollAll() {
  await Promise.allSettled(
    FEED_SYMBOLS.map(async ({ symbol, yahooSymbol }) => {
      const price = await fetchYahooPrice(yahooSymbol);
      if (price !== null) {
        staleCounters.set(symbol, 0);
        broadcastFn?.(symbol, price);
      } else {
        const count = (staleCounters.get(symbol) ?? 0) + 1;
        staleCounters.set(symbol, count);
        if (count === 3) {
          logger.warn({ symbol }, "Forex/commodity price feed stale (market closed or blocked)");
        }
      }
    }),
  );
}

/**
 * Start the forex/commodities price feed.
 * @param onPriceUpdate Called on every successful price tick.
 */
export function initForexFeed(onPriceUpdate?: (symbol: string, price: number) => void) {
  broadcastFn = onPriceUpdate ?? null;
  logger.info("Forex/commodities feed initializing");
  void pollAll();
  pollTimer = setInterval(pollAll, POLL_INTERVAL_MS);
}

export function stopForexFeed() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

/** Symbols managed by this feed (for DB seeding reference). */
export const FOREX_SYMBOLS = FEED_SYMBOLS.map((f) => f.symbol);
