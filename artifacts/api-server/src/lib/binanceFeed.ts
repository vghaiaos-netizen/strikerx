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

const priceCache  = new Map<string, number>();
const changeCache = new Map<string, number>(); // 24h % change

let ws: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let broadcastFn: ((symbol: string, price: number) => void) | null = null;

function connect() {
  if (ws) {
    try { ws.terminate(); } catch { /* ignore */ }
    ws = null;
  }

  ws = new WebSocket(BINANCE_STREAM_URL);

  ws.on("open", () => {
    logger.info("Binance price feed connected");
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  });

  ws.on("message", (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString()) as { data?: { s?: string; c?: string; P?: string } };
      const ticker = msg.data;
      if (!ticker?.s || !ticker?.c) return;
      const price = parseFloat(ticker.c);
      if (isNaN(price) || price <= 0) return;
      // ticker.s is e.g. "BTCUSDT" → strip USDT to get "BTC"
      const symbol = ticker.s.replace(/USDT$/, "").toUpperCase();
      priceCache.set(symbol, price);
      // P = price change percent over 24h (included in the @ticker stream)
      const pct = parseFloat(ticker.P ?? "");
      if (!isNaN(pct)) changeCache.set(symbol, pct);
      broadcastFn?.(symbol, price);
    } catch { /* malformed frame — ignore */ }
  });

  ws.on("close", () => {
    logger.warn("Binance price feed disconnected — reconnecting in 5 s");
    scheduleReconnect();
  });

  ws.on("error", (err: Error) => {
    logger.error({ err: err.message }, "Binance price feed error");
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
