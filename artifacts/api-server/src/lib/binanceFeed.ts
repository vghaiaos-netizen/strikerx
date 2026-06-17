import WebSocket from "ws";
import { logger } from "./logger";

/**
 * Binance real-time price feed.
 *
 * Subscribes to the combined stream for all trading assets over Binance's
 * public WebSocket API (no API key required). Prices are stored in memory
 * and exposed via getPrice() / getAllPrices().
 *
 * broadcastPriceUpdate is injected at init time to avoid a circular import
 * with wsServer (wsServer imports tradingEngine; tradingEngine imports this).
 */

const CRYPTO_PAIRS = ["btcusdt", "ethusdt", "solusdt", "bnbusdt", "tonusdt", "xrpusdt", "dogeusdt", "avaxusdt", "maticusdt"];

const BINANCE_STREAM_URL =
  "wss://stream.binance.com:9443/stream?streams=" +
  CRYPTO_PAIRS.map((s) => `${s}@ticker`).join("/");

const CRYPTO_REST_SYMBOLS = CRYPTO_PAIRS.map((s) => s.toUpperCase());

const priceCache  = new Map<string, number>();
const changeCache = new Map<string, number>(); // 24h % change

let ws: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let broadcastFn: ((symbol: string, price: number) => void) | null = null;
let restTimer: NodeJS.Timeout | null = null;
let wsConnected = false;

// CoinGecko → Binance symbol mapping
const COINGECKO_IDS: Record<string, string> = {
  BTC:   "bitcoin",
  ETH:   "ethereum",
  SOL:   "solana",
  BNB:   "binancecoin",
  TON:   "the-open-network",
  XRP:   "ripple",
  DOGE:  "dogecoin",
  AVAX:  "avalanche-2",
  MATIC: "matic-network",
};

async function pollCoinGecko() {
  try {
    const ids = Object.values(COINGECKO_IDS).join(",");
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;
    const r   = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!r.ok) return;
    const data = await r.json() as Record<string, { usd: number; usd_24h_change?: number }>;
    let updated = 0;
    for (const [base, geckoId] of Object.entries(COINGECKO_IDS)) {
      const entry = data[geckoId];
      if (!entry?.usd || entry.usd <= 0) continue;
      priceCache.set(base, entry.usd);
      if (entry.usd_24h_change != null && !isNaN(entry.usd_24h_change)) {
        changeCache.set(base, entry.usd_24h_change);
      }
      broadcastFn?.(base, entry.usd);
      updated++;
    }
    if (updated > 0) logger.debug({ updated }, "Crypto prices updated (CoinGecko)");
  } catch (err) {
    logger.warn({ err }, "CoinGecko price poll failed");
  }
}

/** REST fallback — tries Binance REST first, falls back to CoinGecko when blocked */
async function pollBinanceRest() {
  let binanceOk = false;
  try {
    const syms = JSON.stringify(CRYPTO_REST_SYMBOLS);
    const r    = await fetch(
      `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(syms)}`,
      { signal: AbortSignal.timeout(5_000) },
    );
    if (r.ok) {
      const data = await r.json() as Array<{ symbol: string; lastPrice: string; priceChangePercent: string }>;
      for (const { symbol, lastPrice, priceChangePercent } of data) {
        const base  = symbol.replace(/USDT$/, "").toUpperCase();
        const price = parseFloat(lastPrice);
        const pct   = parseFloat(priceChangePercent);
        if (isNaN(price) || price <= 0) continue;
        priceCache.set(base, price);
        if (!isNaN(pct)) changeCache.set(base, pct);
        broadcastFn?.(base, price);
        binanceOk = true;
      }
    }
  } catch { /* fall through to CoinGecko */ }

  // If Binance REST is also blocked, use CoinGecko
  if (!binanceOk) await pollCoinGecko();
}

function startRestFallback() {
  if (restTimer) return;
  void pollBinanceRest();
  // Crypto updates every 5s via Binance REST or CoinGecko
  restTimer = setInterval(pollBinanceRest, 5_000);
  logger.info("Binance price REST fallback started (will use CoinGecko if Binance is blocked)");
}

function connect() {
  if (ws) {
    try { ws.terminate(); } catch { /* ignore */ }
    ws = null;
  }

  ws = new WebSocket(BINANCE_STREAM_URL);

  ws.on("open", () => {
    wsConnected = true;
    logger.info("Binance price feed connected (WebSocket)");
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  });

  ws.on("message", (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString()) as { data?: { s?: string; c?: string; P?: string } };
      const ticker = msg.data;
      if (!ticker?.s || !ticker?.c) return;
      const price = parseFloat(ticker.c);
      if (isNaN(price) || price <= 0) return;
      const symbol = ticker.s.replace(/USDT$/, "").toUpperCase();
      priceCache.set(symbol, price);
      const pct = parseFloat(ticker.P ?? "");
      if (!isNaN(pct)) changeCache.set(symbol, pct);
      broadcastFn?.(symbol, price);
    } catch { /* malformed frame — ignore */ }
  });

  ws.on("close", () => {
    wsConnected = false;
    logger.warn("Binance price feed disconnected — reconnecting in 5 s");
    startRestFallback();
    scheduleReconnect();
  });

  ws.on("error", (err: Error) => {
    wsConnected = false;
    logger.error({ err: err.message }, "Binance price feed error");
    startRestFallback();
    scheduleReconnect();
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, 5_000);
}

/**
 * Start the Binance price feed.
 * @param onPriceUpdate Called on every price tick — use to broadcast to WS clients.
 */
export function initBinanceFeed(onPriceUpdate?: (symbol: string, price: number) => void) {
  broadcastFn = onPriceUpdate ?? null;
  logger.info("Binance price feed initializing");
  connect();
}

/** Current price for a base symbol (e.g. "BTC"). Returns null if not yet received. */
export function getPrice(symbol: string): number | null {
  return priceCache.get(symbol.toUpperCase()) ?? null;
}

/** Snapshot of all current prices keyed by base symbol. */
export function getAllPrices(): Record<string, number> {
  return Object.fromEntries(priceCache);
}

/** Snapshot of all 24h % changes keyed by base symbol. */
export function get24hChanges(): Record<string, number> {
  return Object.fromEntries(changeCache);
}

/**
 * Write an external price (e.g. from the forex feed) into the shared cache.
 * This makes getPrice() / getAllPrices() work for any asset class.
 */
export function setExternalPrice(symbol: string, price: number) {
  priceCache.set(symbol.toUpperCase(), price);
}

/**
 * Write an external 24h % change (e.g. from the forex feed) into the shared cache.
 */
export function setExternalChange(symbol: string, changePct: number) {
  changeCache.set(symbol.toUpperCase(), changePct);
}
