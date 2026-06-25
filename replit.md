# StrikerX

Binary prediction trading terminal inside Telegram (football/World Cup theme). Fixed-odds UP/DOWN contracts on crypto, forex, commodities (1.82×). Four casino games as retention tools. STRIKER tokens, demo USDT, CryptoBot payments, dual bot architecture, real-time WebSocket prices.

> **Full architecture, DB schema, handoff notes: `docs/AGENT_HANDOFF.md`**
> **Detailed dev guide: `docs/for-replit-agents.md`**

## User preferences
- No emojis in UI — use lucide-react icons instead
- Dark mode first (deep navy/black, vibrant green, gold accents — football stadium aesthetic)

---

## FOR AGENTS — SESSION START

```bash
pnpm install                  # sync deps (~30s first time)
node scripts/setup-db.mjs     # apply any pending DB migrations (non-interactive, safe to re-run)
# Restart workflows: "API Server" (port 8000) and "Start application" (port 5000)
# That's it — generated files ARE committed
```

**Only run codegen if you changed `lib/api-spec/openapi.yaml`:**
```bash
pnpm --filter @workspace/api-spec run codegen
```

> `drizzle-kit push` requires a TTY and will fail in Replit. Always use `node scripts/setup-db.mjs` instead.

**Post-merge is automatic** — `scripts/post-merge.sh` runs `pnpm install` + codegen after every task agent merge.

> Full dev guide: `docs/for-replit-agents.md`

---

## Secrets (already set — do not re-ask)

`JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `GAMEBOT_TOKEN`, `GROUPBOT_TOKEN`, `CRYPTOBOT_TOKEN`, `DATABASE_URL`, `GITHUB_PERSONAL_ACCESS_TOKEN` — all present and working.

> `viewEnvVars()` won't show user secrets; verify via API Server startup logs instead.

---

## Shared env vars

| Variable | Value |
|---|---|
| `TELEGRAM_GROUP_ID` | `-5141022548` |
| `MINI_APP_LINK` | `t.me/StrykkerXBot/StrikerX` |
| `OPERATOR_TON_WALLET` | `UQAokp-Xaa6wS1hxk33LMAjHaOjLsP5iQuAtAnv4K0PKdVPx` |

Domain detection is automatic: `REPLIT_DOMAINS → RAILWAY_PUBLIC_DOMAIN → REPLIT_DEV_DOMAIN`. Do NOT manually set `WEBHOOK_DOMAIN`, `CORS_ORIGIN`, or `RAILWAY_PUBLIC_DOMAIN`.

---

## Production = Railway. Replit = Development only.

```bash
node scripts/github-push.mjs           # push main app → Railway auto-deploys (~3 min)
node scripts/github-push-outreach.mjs  # push outreach service only (separate branch)
```

Never push outreach changes with `github-push.mjs` — it targets `main`.

**Session end — always push:**
```bash
pnpm run typecheck && node scripts/github-push.mjs
```

---

## Critical rules

- **Never `git push`** — use `node scripts/github-push.mjs` (blocked in Replit)
- **Never `console.log` in server code** — use `req.log` (routes) or `logger` (everywhere else)
- **Never edit generated files** in `lib/api-client-react/src/generated/` or `lib/api-zod/src/generated/`
- **Never `drizzle-kit push` against Railway** — apply schema changes via `index.ts` migration array
- **Never add `setWebhook` to `gameBot.ts` / `groupBot.ts`** — centralised in `app.ts`
- **Never construct referral links from server domain** — always use `MINI_APP_LINK` env var
- **Drizzle numeric columns return strings** — always `parseFloat(String(value))`
- **Binance WebSocket blocked on Replit (451)** — REST fallback in `binanceFeed.ts` handles it automatically
- **CryptoBot webhook must be set manually** via @CryptoBot in Telegram — no API for it
- **Dev auth bypass:** `POST /api/auth/telegram` `{ "initData": "dev:123456:player_dev" }`

---

## Run & Operate

| Command | What it does |
|---|---|
| `pnpm --filter @workspace/api-server run build` | Build API server |
| `pnpm --filter @workspace/strikerx run dev` | Run frontend (port 5000) |
| `pnpm run typecheck` | Full typecheck |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerate hooks + Zod schemas (only if openapi.yaml changed) |
| `pnpm --filter @workspace/db run push` | Push schema to dev DB only |

---

## Stack

pnpm monorepo · Node 24 · TypeScript 5.9 · Express 5 · PostgreSQL + Drizzle ORM · React + Vite + TailwindCSS + shadcn/ui · Telegraf v4 · CryptoBot · WebSocket `/ws`

## Key config keys (`app_config` table)

`striker_deposit_rate` (100), `striker_withdraw_rate` (110), `jackpot_min_pool`, `welcome_bonus_striker` (500), `match_event_active`, `rate_event_active` — use `configService.getConfig(key)` / `setConfig(key, value)`.

## Token economy

| Token | Rate | Purpose |
|---|---|---|
| STRIKER | 100/TON deposit, 110/TON withdraw | Casino games |
| TON | 1:1 | Binary trading wallet |
| USDT | 1:1 | Binary trading wallet |
| BOOT | earned in-game | Redeemable for STRIKER |

## Where things live

```
lib/
  api-spec/openapi.yaml                       — OpenAPI spec (source of truth)
  api-client-react/src/generated/api.ts       — Generated React Query hooks (committed)
  api-zod/src/generated/                      — Generated Zod schemas (committed)
  db/src/schema/                              — Drizzle ORM schema files
artifacts/
  api-server/src/
    routes/                                   — Express route handlers
    lib/
      binanceFeed.ts, forexFeed.ts            — Price feeds
      tradingEngine.ts, crashEngine.ts        — Game engines
      gameBot.ts, groupBot.ts                 — Telegraf bot instances
      configService.ts                        — DB-backed config (cached 60s)
  strikerx/src/
    pages/                                    — Player-facing pages
    pages/admin/                              — Admin dashboard
    lib/auth.tsx                              — AuthContext
docs/                                         — Architecture, schema, handoff notes
scripts/github-push.mjs                       — GitHub push (use instead of git push)
```
