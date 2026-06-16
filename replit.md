# StrikerX

A **binary prediction trading terminal** inside Telegram, styled around football/World Cup. Primary product: fixed-odds UP/DOWN contracts on crypto, forex, and commodities (1.82× payout). Secondary: four casino games (Shot, Penalty, Minefield, Free Kick) as retention tools. Players trade with STRIKER tokens, practice with demo USDT, deposit/withdraw via CryptoBot, and refer friends for lifetime commission. Dual Telegram bot architecture, private admin dashboard, real-time WebSocket price feed.

> **Full architecture, DB schema, and handoff notes: `docs/AGENT_HANDOFF.md`**
> **Railway DB connection string: `docs/railway-db.md`**
> **Agent setup guide: `docs/for-replit-agents.md`**

## User preferences

- No emojis in UI — use lucide-react icons instead
- Dark mode first (deep navy/black, vibrant green, gold accents — football stadium aesthetic)

---

## FOR AGENTS — QUICK START (do this first, in order, takes ~30s)

```bash
# 1. Install dependencies (pnpm is pre-installed on Replit)
pnpm install

# 2. Regenerate the API client from the OpenAPI spec (REQUIRED — generated files are not committed)
pnpm --filter @workspace/api-spec run codegen

# 3. Restart both workflows — the DB schema already exists on the Replit postgres (helium)
#    Workflows: "API Server" and "Start application"
```

That's it. Both workflows will start cleanly. No DB push needed — all tables already exist.

> Full Replit dev guide: `docs/for-replit-agents.md`
> Full Railway setup guide: `docs/railway.md`

---

## Production = Railway. Replit = Development only.

**The Replit dev URL changes every restart — it cannot host bots reliably.**
Railway is the permanent production host.

### Two-branch deploy model

| What changed | Push command | Branch |
|---|---|---|
| Mini app / API server | `node scripts/github-push.mjs` | `main` |
| Outreach service | `node scripts/github-push-outreach.mjs` | `outreach` |

**Never push outreach changes with `github-push.mjs`** — that targets `main` and redeploys the mini app.

---

## Replit dev secrets (already set — do not re-ask the user)

`JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `GAMEBOT_TOKEN`, `GROUPBOT_TOKEN`, `CRYPTOBOT_TOKEN`, `DATABASE_URL`, `GITHUB_PERSONAL_ACCESS_TOKEN` — all set and working.

> `viewEnvVars()` only shows Replit-managed vars. User secrets are invisible to that tool but ARE present. Verify via API Server startup logs.

---

## Shared env vars

| Variable | Value |
|---|---|
| `TELEGRAM_GROUP_ID` | `-5141022548` |
| `MINI_APP_LINK` | `t.me/StrykkerXBot/StrikerX` |
| `OPERATOR_TON_WALLET` | `UQAokp-Xaa6wS1hxk33LMAjHaOjLsP5iQuAtAnv4K0PKdVPx` |

---

## Domain detection (auto — no manual config needed)

```
WEBHOOK_DOMAIN  →  REPLIT_DOMAINS  →  RAILWAY_PUBLIC_DOMAIN  →  REPLIT_DEV_DOMAIN
```

Do NOT manually set `WEBHOOK_DOMAIN`, `CORS_ORIGIN`, or `RAILWAY_PUBLIC_DOMAIN` — they auto-detect.

---

## Run & Operate

| Command | What it does |
|---|---|
| `pnpm --filter @workspace/api-server run build` | Build API server |
| `pnpm --filter @workspace/strikerx run dev` | Run React frontend (port 5000) |
| `pnpm run typecheck` | Full typecheck |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerate React Query hooks + Zod schemas |
| `pnpm --filter @workspace/db run push` | Push Drizzle schema to DB (dev only) |
| `node scripts/github-push.mjs` | Push to GitHub `main` → triggers Railway deploy |

**Dev auth bypass:** `POST /api/auth/telegram` with `{ "initData": "dev:123456:player_dev" }` — dev only.

---

## Stack

- **Monorepo:** pnpm workspaces, Node.js 24, TypeScript 5.9
- **API:** Express 5, Pino logger, Helmet, express-rate-limit
- **DB:** PostgreSQL + Drizzle ORM (numeric columns return as `string` — always `parseFloat(String(...))`)
- **Validation:** Zod (`zod/v4`), `drizzle-zod`
- **Frontend:** React + Vite + TailwindCSS + shadcn/ui + Framer Motion
- **Bots:** Telegraf v4 — GameBot (player DMs) + GroupBot (community channel)
- **Payments:** CryptoBot API (TON/USDT/BNB/SOL)
- **Real-time:** Native WebSocket at `/ws`

---

## Where things live

```
lib/
  api-spec/openapi.yaml          — OpenAPI spec (source of truth)
  api-client-react/src/generated/api.ts  — Generated React Query hooks
  api-zod/src/generated/api.ts   — Generated Zod schemas
  db/src/schema/                 — Drizzle ORM schema files

artifacts/
  api-server/src/
    routes/                      — Express route handlers
    lib/
      binanceFeed.ts             — Crypto prices (WS + REST fallback)
      forexFeed.ts               — Forex (open.er-api.com) + Commodities (Yahoo Finance)
      tradingEngine.ts           — Position open/settle logic
      crashEngine.ts             — The Shot singleton engine
      gameBot.ts                 — GameBot Telegraf instance
      groupBot.ts                — GroupBot Telegraf instance
      configService.ts           — DB-backed key/value config (cached 60s)

  strikerx/src/
    pages/                       — Player-facing pages
    pages/admin/                 — Admin dashboard pages
    components/                  — Shared UI components
    lib/auth.tsx                 — AuthContext (token, player, adminToken)

docs/                            — Architecture, DB schema, handoff notes
scripts/github-push.mjs          — GitHub push script (use instead of git push)
```

---

## Critical rules

- **Never `console.log` in server code** — use `req.log` (route handlers) or `logger` (elsewhere)
- **Never `git push`** — use `node scripts/github-push.mjs` (git push is blocked in Replit)
- **Never `pnpm --filter @workspace/db run push` against Railway** — apply schema changes via manual SQL
- **Never edit generated files** in `lib/api-client-react/src/generated/` or `lib/api-zod/src/generated/`
- **Never add `setWebhook` to `gameBot.ts` or `groupBot.ts`** — webhook registration is only in `app.ts`
- **Never construct referral links from server domain** — always use `MINI_APP_LINK` env var
- **Drizzle numeric returns strings** — always `parseFloat(String(value))`
- **Binance WebSocket is blocked on Replit (451)** — REST fallback in `binanceFeed.ts` handles this
- **CryptoBot webhook must be set manually** via @CryptoBot in Telegram — no API for it

---

## Key config keys (stored in `app_config` table)

`striker_deposit_rate` (100), `striker_withdraw_rate` (110), `jackpot_min_pool`, `welcome_bonus_striker` (500), `match_event_active`, `rate_event_active` — use `configService.getConfig(key)` / `setConfig(key, value)`.

---

## Token economy

| Token | Rate | Purpose |
|---|---|---|
| STRIKER | 100/TON deposit, 110/TON withdraw | Casino games |
| TON | 1:1 | Binary trading wallet |
| USDT | 1:1 | Binary trading wallet |
| BOOT | earned in-game | Redeemable for STRIKER |
