import { logger } from "./logger";
import { setExternalChange } from "./binanceFeed";

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

interface YahooData { price: number; changePct?: number }

async function fetchYahooPrice(yahooSymbol: string): Promise<YahooData | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1m&range=2m`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible)" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await res.json() as any;
    const meta = json?.chart?.result?.[0]?.meta;
    const price: unknown = meta?.regularMarketPrice;
    if (typeof price !== "number" || price <= 0) return null;
    const pct: unknown = meta?.regularMarketChangePercent;
    return { price, changePct: typeof pct === "number" ? pct : undefined };
  } catch {
    return null;
  }
}

async function pollAll() {
  await Promise.allSettled(
    FEED_SYMBOLS.map(async ({ symbol, yahooSymbol }) => {
      const data = await fetchYahooPrice(yahooSymbol);
      if (data !== null) {
        staleCounters.set(symbol, 0);
        broadcastFn?.(symbol, data.price);
        if (data.changePct !== undefined) setExternalChange(symbol, data.changePct);
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
