---
name: Bot webhook architecture
description: How Telegram webhook registration works for GameBot and GroupBot — centralised in app.ts, not in the bot init files.
---

# Bot Webhook Architecture

## The rule
Webhook registration lives **only** in `artifacts/api-server/src/app.ts` (the startup IIFE). `gameBot.ts` and `groupBot.ts` must NOT register webhooks.

**Why:** When both bot init functions AND app.ts register webhooks in the same boot sequence, Telegram returns 429 rate-limit errors. The bot inits run first (called by the Promise.all in app.ts), then app.ts tries to register again — double registration.

## What bot inits do instead
They only call `deleteWebhook({ drop_pending_updates: true })` to clear any stale polling/webhook state from a previous process, then log that they're initialized and ready.

## app.ts registration flow
1. `initGameBot()` → registers commands, clears stale webhook
2. `initGroupBotScheduler()` → registers commands, clears stale webhook
3. 1500ms delay (avoid Telegram rate-limit between the two registrations)
4. `registerTgWebhook(GAMEBOT_TOKEN, "/bots/gamebot/webhook", "GameBot")`
5. `registerTgWebhook(GROUPBOT_TOKEN, "/bots/groupbot/webhook", "GroupBot")`

## Webhook URL paths (with /webhook suffix — not just /bots/gamebot)
- `POST /api/bots/gamebot/webhook` — defined in `routes/bots.ts`
- `POST /api/bots/groupbot/webhook` — defined in `routes/bots.ts`

The `/webhook` suffix is required. The earlier bug (before fix) had routes defined as `/bots/gamebot` without the suffix, causing Telegram updates to 404.

## Domain detection
`app.ts` resolves: `process.env.WEBHOOK_DOMAIN ?? process.env.REPLIT_DOMAINS?.split(",")[0]?.trim()`
On Replit deployment, `REPLIT_DOMAINS` is auto-set so no manual config is needed.
