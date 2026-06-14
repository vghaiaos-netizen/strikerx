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

const BINANCE_STREAM_URL =
  "wss://stream.binance.com:9443/stream?streams=" +
  ["btcusdt", "ethusdt", "solusdt", "bnbusdt", "tonusdt"]
    .map((s) => `${s}@ticker`)
    .join("/");

const CRYPTO_REST_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "TONUSDT"];

const priceCache  = new Map<string, number>();
const changeCache = new Map<string, number>(); // 24h % change

let ws: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let broadcastFn: ((symbol: string, price: number) => void) | null = null;
let restTimer: NodeJS.Timeout | null = null;
let wsConnected = false;

/** REST fallback — polls Binance HTTP API every 4s when WebSocket is blocked */
async function pollBinanceRest() {
  try {
    const syms = JSON.stringify(CRYPTO_REST_SYMBOLS);
    const r = await fetch(
      `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(syms)}`,
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!r.ok) return;
    const data = await r.json() as Array<{ symbol: string; lastPrice: string; priceChangePercent: string }>;
    for (const { symbol, lastPrice, priceChangePercent } of data) {
      const base  = symbol.replace(/USDT$/, "").toUpperCase();
      const price = parseFloat(lastPrice);
      const pct   = parseFloat(priceChangePercent);
      if (isNaN(price) || price <= 0) continue;
      priceCache.set(base, price);
      if (!isNaN(pct)) changeCache.set(base, pct);
      broadcastFn?.(base, price);
    }
  } catch { /* non-fatal — WebSocket may be providing data */ }
}

function startRestFallback() {
  if (restTimer) return;
  // Poll immediately, then every 4 seconds
  void pollBinanceRest();
  restTimer = setInterval(pollBinanceRest, 4_000);
  logger.info("Binance REST price feed started (WebSocket unavailable)");
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
