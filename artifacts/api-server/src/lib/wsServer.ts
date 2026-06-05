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
}

const clients = new Map<WebSocket, WsClient>();

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
    const client: WsClient = { ws };
    clients.set(ws, client);
    logger.info({ clients: clients.size }, "WebSocket client connected");

    // Send current round state immediately
    sendToClient(ws, "round_state", crashEngine.getPublicState());

    ws.on("message", async (raw) => {
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
      clients.delete(ws);
      logger.info({ clients: clients.size }, "WebSocket client disconnected");
    });

    ws.on("error", (err) => {
      logger.error({ err }, "WebSocket error");
      clients.delete(ws);
    });
  });

  logger.info("WebSocket server initialized at /ws");
  return wss;
}
