# StrikerX — Railway Deployment Guide

Railway gives StrikerX a permanent HTTPS URL that never changes, solving the
"Replit dev URL rotates on restart" problem. One Railway service runs everything:
Express API + React frontend + Telegram bots + WebSocket crash game.

---

## Architecture on Railway

```
railway service (single process, PORT auto-set by Railway)
├── GET  /api/*                         Express API
├── GET  /ws                            WebSocket — crash game
├── POST /api/bots/gamebot/webhook      GameBot (Telegram)
├── POST /api/bots/groupbot/webhook     GroupBot (Telegram)
├── POST /api/payments/webhook/cryptobot CryptoBot payments
└── GET  /*                             React SPA (served from dist)
```

`RAILWAY_PUBLIC_DOMAIN` is auto-injected by Railway and picked up by the
domain-detection logic in `app.ts`, `gameBot.ts`, and `groupBot.ts`.
No manual URL configuration needed.

---

## One-time Setup

### 1. Create a Railway project

1. Go to [railway.app](https://railway.app) → **New Project**
2. Choose **Deploy from GitHub repo** → select `vghaiaos-netizen/strikerx`
3. Railway auto-detects the `railway.json` build/start config

### 2. Add PostgreSQL

In the Railway project dashboard:
- Click **+ Add Service** → **Database** → **PostgreSQL**
- Railway injects `DATABASE_URL` automatically — no manual wiring

### 3. Set environment variables

In the Railway service → **Variables** tab, add all of the following:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | *(strong random string — same as Replit secret)* |
| `ADMIN_USERNAME` | *(your admin username)* |
| `ADMIN_PASSWORD` | *(your admin password)* |
| `GAMEBOT_TOKEN` | *(GameBot token from @BotFather)* |
| `GROUPBOT_TOKEN` | *(GroupBot token from @BotFather)* |
| `CRYPTOBOT_TOKEN` | *(from @CryptoBot → /myapps → API)* |
| `TELEGRAM_GROUP_ID` | `-5141022548` |
| `MINI_APP_LINK` | `t.me/StrykkerXBot/StrikerX` |
| `OPERATOR_TON_WALLET` | `UQAokp-Xaa6wS1hxk33LMAjHaOjLsP5iQuAtAnv4K0PKdVPx` |
| `OPERATOR_USDT_TON_WALLET` | `UQAokp-Xaa6wS1hxk33LMAjHaOjLsP5iQuAtAnv4K0PKdVPx` |
| `OPERATOR_USDT_TRC20_WALLET` | `TRf9993cfY4zH4k6Q8eSUoK8cc4HzPA8cg` |
| `NODE_VERSION` | `22` |

> **Do NOT set** `WEBHOOK_DOMAIN`, `CORS_ORIGIN`, or `PORT` — these are
> auto-detected from Railway's runtime environment.

### 4. Apply the database schema (one-time)

**IMPORTANT: Do NOT run `pnpm db push` against a Railway DB with live data — it drops and recreates tables.**

After the first successful deploy (before any real players/data), you can use:

```bash
# From Replit bash shell, using the Railway connection string
psql "postgresql://postgres:PASSWORD@HOST:PORT/railway" \
  -f <(DATABASE_URL="postgresql://..." node -e "require('./lib/db/src/schema')")
```

The safest approach for a fresh Railway PostgreSQL (no data yet):
```bash
# Only safe on a brand-new empty database
DATABASE_URL="postgresql://postgres:PASSWORD@HOST:PORT/railway" pnpm --filter @workspace/db run push
```

For any schema change after launch, write and run manual `ALTER TABLE` SQL against the Railway connection string. The schema files are in `lib/db/src/schema/`.

### 5. Note your permanent Railway URL

Railway assigns a URL like `yourapp.up.railway.app`. You can also add a
custom domain in the Railway dashboard.

This URL **never changes** — set it once in BotFather and forget it.

### 6. Set BotFather Mini App URL (permanent)

```
@BotFather → /mybots → @StrykkerXBot → Bot Settings → Menu Button → Edit Menu Button URL
Set to: https://yourapp.up.railway.app
```

### 7. Register CryptoBot webhook (manual — one-time)

CryptoPay has no API for this — must be done in Telegram:

```
@CryptoBot → /myapps → StrikerX → Webhooks
Set URL to: https://yourapp.up.railway.app/api/payments/webhook/cryptobot
```

The exact URL is also logged on every server startup:
look for `"CryptoBot webhook URL"` in Railway deployment logs.

---

## Development workflow

```
Edit code on Replit  →  node scripts/github-push.mjs  →  Railway auto-deploys (~2 min)
```

Railway watches the `main` branch. Every push triggers a rebuild automatically.
The Telegram webhooks re-register themselves on every startup — no manual step.

---

## Railway vs Replit production — differences

| | Railway | Replit Publish |
|---|---|---|
| URL stability | Permanent | Permanent |
| WebSockets | Full support | Full support (vm target) |
| Always-on | Yes (Hobby $5/mo) | Yes (vm deployment) |
| Auto-deploy from GitHub | Yes | No (manual Publish click) |
| Env var injection | Railway dashboard | Replit Secrets panel |
| DB | Add PostgreSQL service | Replit-managed PostgreSQL |
| Node version | Set `NODE_VERSION=22` env var | Managed by Replit |

---

## Troubleshooting

**Build fails — pnpm not found**
Railway's Nixpacks uses `nixpacks.toml` at the repo root to install `pnpm`.
Check that `nixpacks.toml` is committed.

**Server crashes on start — "No CORS origin configured"**
`RAILWAY_PUBLIC_DOMAIN` must be set. It's auto-injected when the service has a
public URL. Ensure the service is not set to private-only.

**Bot not responding after deploy**
Telegram webhooks are registered automatically on startup. Check Railway logs
for `"Telegram webhook registered"`. If missing, verify `GAMEBOT_TOKEN` and
`GROUPBOT_TOKEN` are set in Railway Variables.

**WebSocket connections dropping**
Railway Hobby plan supports persistent WebSocket connections. If using a
free plan, upgrade — free tier has connection time limits.

**Database schema missing columns**
Run `pnpm --filter @workspace/db run push` against the Railway DATABASE_URL
(see step 4 above). Never run this against production if data exists — use
manual `ALTER TABLE` instead.

---

## Key env vars Railway auto-injects

These are set by Railway at runtime — never set them manually:

| Variable | What it contains |
|---|---|
| `DATABASE_URL` | Full PostgreSQL connection string |
| `RAILWAY_PUBLIC_DOMAIN` | e.g. `yourapp.up.railway.app` |
| `PORT` | The port the process must bind to |
| `RAILWAY_ENVIRONMENT` | `production` |
