---
name: StrikerX deployment handoff
description: Complete state of what is set, what auto-configures, and the exact steps to deploy. Read before doing anything deployment-related.
---

# StrikerX Deployment Handoff

## Secrets — already set, do not re-request

These are confirmed working. `viewEnvVars()` will NOT list them (it only shows Replit-managed runtime vars). Verify by checking server startup logs — a clean boot with bot init messages confirms they are present.

| Secret | Confirmed by |
|---|---|
| `JWT_SECRET` | Server runs without fatal crash |
| `ADMIN_USERNAME` | Server runs without fatal crash |
| `ADMIN_PASSWORD` | Server runs without fatal crash (not "admin123") |
| `GAMEBOT_TOKEN` | Logs show "GameBot webhook registered" on startup |
| `GROUPBOT_TOKEN` | GroupBot initializes without error |
| `CRYPTOBOT_API_TOKEN` | `curl pay.crypt.bot/api/getMe` returns `app_id=592023, name="StrikerX"` |
| `DATABASE_URL` | Replit managed — never touch |

## Env vars — already set as shared env vars (persist across sessions)

| Variable | Value |
|---|---|
| `TELEGRAM_GROUP_ID` | `-5141022548` |
| `MINI_APP_LINK` | `t.me/StrykkerXBot/StrikerX` |
| `OPERATOR_TON_WALLET` | `UQAokp-Xaa6wS1hxk33LMAjHaOjLsP5iQuAtAnv4K0PKdVPx` |
| `OPERATOR_USDT_TON_WALLET` | `UQAokp-Xaa6wS1hxk33LMAjHaOjLsP5iQuAtAnv4K0PKdVPx` |
| `OPERATOR_USDT_TRC20_WALLET` | `TRf9993cfY4zH4k6Q8eSUoK8cc4HzPA8cg` |

## What auto-configures on deploy — zero action needed

`WEBHOOK_DOMAIN` and `CORS_ORIGIN` are NOT required as secrets. The code reads `process.env.REPLIT_DOMAINS` (auto-set by Replit to the `*.replit.app` production domain) as a fallback. Both Telegram bot webhooks register automatically on first boot.

**Why:** `app.ts` startup IIFE: `const effectiveDomain = process.env.WEBHOOK_DOMAIN ?? process.env.REPLIT_DOMAINS?.split(",")[0]?.trim()`

## Deployment config — already set in .replit

- **Target:** `vm` — NEVER change to `autoscale`. WebSocket crash game engine is a singleton with in-memory state. Autoscale kills connections between requests.
- **Build:** `pnpm install --frozen-lockfile && pnpm --filter @workspace/strikerx run build && pnpm --filter @workspace/api-server run build`
- **Run:** `NODE_ENV=production PORT=5000 node --enable-source-maps artifacts/api-server/dist/index.mjs`

## Exact deployment steps

1. Click **Publish** in the Replit UI. Build runs automatically (~3 min).
2. On first startup, bots auto-register webhooks. Check deployment logs for:
   - `"Telegram webhook registered"` for GameBot
   - `"Telegram webhook registered"` for GroupBot
   - `"CryptoBot webhook URL"` — copy this URL for step 3
3. **CryptoBot webhook** (manual — no API exists): Open Telegram → `@CryptoBot` → `/myapps` → select StrikerX → Webhooks → paste URL from logs.
4. **BotFather Mini App**: `@BotFather` → `/myapps` → select GameBot app → set Web App URL to the deployed `https://YOUR.replit.app` domain.

## Production architecture

Single Node.js process on port 5000:
- `/api/*` — Express routes
- `/ws` — WebSocket (crash game)
- `/api/bots/gamebot/webhook` — GameBot Telegram webhook
- `/api/bots/groupbot/webhook` — GroupBot Telegram webhook
- `/api/payments/webhook/cryptobot` — CryptoBot payment confirmation
- `/*` — React SPA static files from `artifacts/strikerx/dist/public`

## Hard rules — do not violate

- Do NOT set `WEBHOOK_DOMAIN` or `CORS_ORIGIN` — they auto-detect.
- Do NOT change `deploymentTarget` to `autoscale`.
- Do NOT run `pnpm --filter @workspace/db run push` in production.
- Do NOT edit generated files in `lib/api-client-react/src/generated/` or `lib/api-zod/src/generated/`.
- Do NOT add webhook registration to `gameBot.ts` or `groupBot.ts` — `app.ts` handles this centrally. Duplicating it causes Telegram 429 rate-limit errors.

## Known limitations (by design, not bugs)

- Withdrawals send to player's CryptoPay balance (via `transfer` API with `user_id`), not to an external wallet. Players withdraw from CryptoPay themselves.
- Exchange rates for non-TON deposits (USDT, SOL etc.) are hardcoded in `payments.ts`. Not real-time market rates.
- CryptoBot webhook cannot be registered via API — always manual setup through @CryptoBot.
