# Railway Agent One-Shot Prompt

Copy and paste the text below exactly into Railway's AI agent (or any deployment agent) to complete the Railway setup in one session.

---

## PROMPT START

You are setting up the production deployment of **StrikerX** — a football-themed Telegram Mini App casino — on Railway. The codebase lives at `github.com/vghaiaos-netizen/strikerx` (main branch). Everything is already built and configured; you are completing the infrastructure setup only.

### What this app is

- Single Node.js process that serves: Express REST API + React SPA frontend + WebSocket crash game + two Telegram bots
- Stack: Node 22, pnpm monorepo, TypeScript, Express 5, PostgreSQL + Drizzle ORM, Telegraf bots, native WebSocket
- Must be always-on (no serverless) — the crash game WebSocket requires a persistent process
- `railway.json` and `nixpacks.toml` are already committed — Railway will detect them automatically

### Step 1 — Create the Railway service

1. New Project → Deploy from GitHub repo → `vghaiaos-netizen/strikerx` → main branch
2. Railway detects `railway.json` automatically. Build and start commands are pre-configured. Do not override them.

### Step 2 — Add PostgreSQL

In the Railway project dashboard:
- **+ Add Service → Database → PostgreSQL**
- Railway auto-injects `DATABASE_URL` — no manual configuration needed

### Step 3 — Set environment variables

In the **StrikerX service → Variables tab**, add every variable below exactly as shown.
Do NOT set `PORT`, `DATABASE_URL`, `RAILWAY_PUBLIC_DOMAIN`, or `RAILWAY_ENVIRONMENT` — Railway injects these automatically.

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | *(ask the user — must be a strong random string, not "dev-secret-change-in-prod")* |
| `ADMIN_USERNAME` | *(ask the user)* |
| `ADMIN_PASSWORD` | *(ask the user — must NOT be "admin123")* |
| `GAMEBOT_TOKEN` | *(ask the user — from @BotFather)* |
| `GROUPBOT_TOKEN` | *(ask the user — from @BotFather)* |
| `CRYPTOBOT_API_TOKEN` | *(ask the user — from @CryptoBot → /myapps → API token)* |
| `TELEGRAM_GROUP_ID` | `-5141022548` |
| `MINI_APP_LINK` | `t.me/StrykkerXBot/StrikerX` |
| `OPERATOR_TON_WALLET` | `UQAokp-Xaa6wS1hxk33LMAjHaOjLsP5iQuAtAnv4K0PKdVPx` |
| `OPERATOR_USDT_TON_WALLET` | `UQAokp-Xaa6wS1hxk33LMAjHaOjLsP5iQuAtAnv4K0PKdVPx` |
| `OPERATOR_USDT_TRC20_WALLET` | `TRf9993cfY4zH4k6Q8eSUoK8cc4HzPA8cg` |

### Step 4 — Deploy and wait

Trigger a deploy. Build takes ~3-4 minutes (installs pnpm deps, builds Vite frontend, compiles TypeScript server). Watch the deploy logs.

**Expected success indicators in logs:**
```
Server listening  {"port": XXXX}
Telegram webhook registered  {"name":"GameBot", "url":"https://..."}
Telegram webhook registered  {"name":"GroupBot", "url":"https://..."}
CryptoBot webhook URL (register manually via @CryptoBot → /setwebhook)  {"url":"https://..."}
```

If you see `FATAL: Required production secrets are not set` — a variable from Step 3 is missing. Check the Variables tab.

### Step 5 — Apply the database schema

After the first successful deploy, run the Drizzle schema push. Use the Railway CLI or the Railway shell:

```bash
# Option A — Railway CLI (install: npm i -g @railway/cli  then: railway login)
railway run --service strikerx pnpm --filter @workspace/db run push

# Option B — paste DATABASE_URL from Railway → PostgreSQL service → Connect tab
DATABASE_URL="postgresql://..." pnpm --filter @workspace/db run push
```

This creates all tables. It is safe to run once. Never run it again on a database that already has player data — use manual `ALTER TABLE` for schema changes instead.

### Step 6 — Note your permanent Railway URL

Railway assigns a URL like `yourapp.up.railway.app`. Find it in:
**Railway dashboard → StrikerX service → Settings → Domains**

This URL **never changes**. All subsequent steps use it.

### Step 7 — Set BotFather Mini App URL (permanent — do once)

Open Telegram → `@BotFather` → `/mybots` → select `@StrykkerXBot` → **Bot Settings → Menu Button → Edit Menu Button URL**

Set URL to: `https://YOUR-RAILWAY-URL`

### Step 8 — Register CryptoBot webhook (manual — do once)

CryptoPay has no API for webhook registration — it must be done in Telegram:

1. Open Telegram → `@CryptoBot` → `/myapps`
2. Select **StrikerX** → **Webhooks**
3. Set webhook URL to: `https://YOUR-RAILWAY-URL/api/payments/webhook/cryptobot`

The exact URL is printed in the deploy logs: search for `"CryptoBot webhook URL"`.

### Step 9 — Verify everything works

```
GET https://YOUR-RAILWAY-URL/api/healthz
→ {"status":"ok"}

GET https://YOUR-RAILWAY-URL/api/public/jackpot
→ {"currentAmountTon":"10.00","status":"building",...}
```

Send `/start` to `@StrykkerXBot` in Telegram — it should open the casino Mini App.

### You are done.

The Telegram bot webhooks auto-register on every deploy. The domain never changes. Future code updates are deployed by pushing to the `main` branch on GitHub (automated via `node scripts/github-push.mjs` from Replit).

## PROMPT END
