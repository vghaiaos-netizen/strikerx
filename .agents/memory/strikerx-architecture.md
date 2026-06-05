---
name: StrikerX Architecture
description: Key architectural decisions for StrikerX that differ from what you'd expect.
---

# StrikerX Architecture Notes

**Why:** These are non-obvious decisions that cost time to rediscover.

## Bot Architecture
Both Telegraf bots (GameBot + GroupBot) run inside the same Express server process (`artifacts/api-server`). They share DB access and logger. Bots only start when GAMEBOT_TOKEN / GROUPBOT_TOKEN env vars are present — missing tokens produce a WARN log and graceful disable, not a crash.

**How to apply:** If bots aren't responding, check that both tokens are in Replit Secrets and restart the api-server workflow.

## Crash Game (The Shot)
The crash game is NOT a live shared multiplayer round. Each call to POST /games/shot/bet resolves the entire bet immediately using a randomly generated crash point. The frontend polls GET /games/shot/round for UI state, but bets are atomic. For true real-time multiplayer crash, a WebSocket upgrade is required (Phase 2 item).

**How to apply:** Don't try to build "cashout during live round" without first adding WebSocket infrastructure.

## Token Spread Revenue
The 10-STRIKER difference between STRIKER_DEPOSIT_RATE (100) and STRIKER_WITHDRAW_RATE (110) is intentional revenue. Never equalize them. The spread means for every full deposit→play→withdraw cycle, the house earns ~9%.

## Dev Mode Auth
In NODE_ENV=development, POST /auth/telegram accepts `initData: "dev:TELEGRAM_ID:USERNAME"` to bypass Telegram signature validation. Useful for testing without a real Mini App.

## New Account First Withdrawal
First withdrawal always goes to `under_review` status regardless of amount. After admin approves it, `firstWithdrawalReviewed` is set to true on the player and future withdrawals auto-process via CryptoBot.

## Admin Config Persistence
PATCH /admin/config updates `process.env` at runtime — changes are NOT persistent across server restarts. For production, these should be stored in a DB config table and loaded on startup.
