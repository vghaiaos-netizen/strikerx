import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "http";
import { crashEngine } from "./crashEngine";
import { logger } from "./logger";
import { verifyToken } from "./auth";
import { db, playersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

interface WsClient {
  ws: WebSocket;
  playerId?: number;
  username?: string;
  // Rate limiting: sliding window of message timestamps
  msgTimestamps: number[];
}

// Per-connection message rate limit: max 30 messages per 10 seconds
const WS_RATE_LIMIT = 30;
const WS_RATE_WINDOW_MS = 10_000;

// Unauthenticated connections are closed after this many ms.
// 60 s gives mobile clients on slow connections time to complete Telegram auth
// before the WS connection is dropped.
const WS_AUTH_TIMEOUT_MS = 60_000;

function isRateLimited(client: WsClient): boolean {
  const now = Date.now();
  client.msgTimestamps = client.msgTimestamps.filter(t => now - t < WS_RATE_WINDOW_MS);
  if (client.msgTimestamps.length >= WS_RATE_LIMIT) return true;
  client.msgTimestamps.push(now);
  return false;
}

const clients = new Map<WebSocket, WsClient>();

/** Returns the number of currently connected WebSocket clients */
export function getConnectedClients(): number {
  return clients.size;
}

function broadcast(event: string, data: unknown) {
  const msg = JSON.stringify({ event, data });
  for (const [ws] of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

/** Exported broadcast — lets other modules push events to all WS clients */
export function broadcastToAll(event: string, data: unknown) {
  broadcast(event, data);
}

/** Send event only to a specific authenticated player */
export function broadcastToPlayer(playerId: number, event: string, data: unknown) {
  const msg = JSON.stringify({ event, data });
  for (const [ws, client] of clients) {
    if (client.playerId === playerId && ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

function sendToClient(ws: WebSocket, event: string, data: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event, data }));
  }
}

export function initWebSocketServer(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  // Register broadcast with crash engine
  crashEngine.setBroadcast(broadcast);

  wss.on("connection", (ws, req) => {
    const client: WsClient = { ws, msgTimestamps: [] };
    clients.set(ws, client);
    logger.info({ clients: clients.size }, "WebSocket client connected");

    // Send current round state immediately
    sendToClient(ws, "round_state", crashEngine.getPublicState());

    // Disconnect unauthenticated clients after 30 seconds — prevents connection exhaustion
    const authTimeout = setTimeout(() => {
      if (!client.playerId) {
        logger.warn({ clients: clients.size }, "WS client failed to authenticate — closing");
        sendToClient(ws, "error", { message: "Authentication timeout. Please reconnect and authenticate." });
        ws.close();
      }
    }, WS_AUTH_TIMEOUT_MS);

    ws.on("message", async (raw) => {
      if (isRateLimited(client)) {
        sendToClient(ws, "error", { message: "Rate limit exceeded. Slow down." });
        return;
      }

      let msg: { type: string; token?: string; payload?: unknown };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      // Authenticate
      if (msg.type === "auth") {
        const token = msg.token;
        if (!token) { sendToClient(ws, "error", { message: "Token required" }); return; }
        const payload = verifyToken(token);
        if (!payload) { sendToClient(ws, "error", { message: "Invalid token" }); return; }
        const [player] = await db.select().from(playersTable).where(eq(playersTable.id, payload.playerId));
        if (!player) { sendToClient(ws, "error", { message: "Player not found" }); return; }
        client.playerId = player.id;
        client.username = player.username;
        clearTimeout(authTimeout);
        sendToClient(ws, "auth_ok", { playerId: player.id, username: player.username, strikerBalance: player.strikerBalance });
        return;
      }

      // Place bet
      if (msg.type === "place_bet") {
        if (!client.playerId) { sendToClient(ws, "error", { message: "Not authenticated" }); return; }
        const { betStriker, autoCashout } = msg.payload as { betStriker: number; autoCashout?: number };
        const result = await crashEngine.placeBet(client.playerId, client.username!, betStriker, autoCashout ?? null);
        if (result.success) {
          sendToClient(ws, "bet_accepted", { roundId: result.roundId, betStriker });
          // Send updated balance
          const [player] = await db.select().from(playersTable).where(eq(playersTable.id, client.playerId));
          sendToClient(ws, "balance_update", { strikerBalance: player?.strikerBalance ?? 0 });
        } else {
          sendToClient(ws, "error", { message: result.error });
        }
        return;
      }

      // Cashout
      if (msg.type === "cashout") {
        if (!client.playerId) { sendToClient(ws, "error", { message: "Not authenticated" }); return; }
        const result = await crashEngine.performCashout(client.playerId);
        if (result.success) {
          sendToClient(ws, "cashout_confirmed", { winAmount: result.winAmount, multiplier: result.multiplier });
          const [player] = await db.select().from(playersTable).where(eq(playersTable.id, client.playerId));
          sendToClient(ws, "balance_update", { strikerBalance: player?.strikerBalance ?? 0 });
        } else {
          sendToClient(ws, "error", { message: result.error });
        }
        return;
      }

      // Ping
      if (msg.type === "ping") {
        sendToClient(ws, "pong", { t: Date.now() });
      }
    });

    ws.on("close", () => {
      clearTimeout(authTimeout);
      clients.delete(ws);
      logger.info({ clients: clients.size }, "WebSocket client disconnected");
    });

    ws.on("error", (err) => {
      clearTimeout(authTimeout);
      logger.error({ err }, "WebSocket error");
      clients.delete(ws);
    });
  });

  logger.info("WebSocket server initialized at /ws");
  return wss;
}
