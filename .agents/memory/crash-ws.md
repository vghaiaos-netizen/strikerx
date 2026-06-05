---
name: WebSocket Crash Game
description: Architecture of The Shot crash game WebSocket layer in StrikerX
---

The Shot is the only game using WebSocket. All other games use standard REST.

**Server:** `artifacts/api-server/src/lib/wsServer.ts` mounts on the same HTTP server as Express via `initWebSocketServer(httpServer)` called from `src/index.ts`. Path is `/ws`.

**Engine:** `artifacts/api-server/src/lib/crashEngine.ts` is a singleton (`getCrashEngine()`). Round lifecycle: `waiting (5s) → running (multiplier ticks every 100ms) → crashed`. Crash point from HMAC-SHA256 seeded RNG. Each round saved to `crash_rounds`, bets to `crash_bets`.

**Auth flow:** Client must send `{ type: "auth", token: "<JWT>" }` immediately on open. Only authenticated connections can place bets or cashout.

**Why:** All players share one active round. The singleton pattern ensures the engine is authoritative and not duplicated per connection.

**How to apply:** Never create a second CrashEngine instance. Always get it via `getCrashEngine()`. If adding a new WS event, update both `wsServer.ts` and the frontend `shot.tsx` handler.
