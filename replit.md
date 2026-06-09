# StrikerX

A football-themed Telegram Mini App casino platform with four original games, three-tier virtual token economy (STRIKER / BOOT / CAPTAIN), multi-currency crypto payments via CryptoBot, dual Telegram bot architecture, and a private admin dashboard. Stake.com meets Hamster Kombat — living entirely inside Telegram.

## User preferences

- No emojis in UI — use lucide-react icons instead
- Dark mode first (deep navy/black, vibrant green, gold accents — football stadium aesthetic)

---

## DEPLOYMENT HANDOFF — READ THIS FIRST

> This section is for the agent doing the production deployment. Everything below is already done. Do not re-configure what is already set.

### Status: Ready to publish

All secrets are set, all configs are wired, the deployment target and commands are configured. The single remaining action is to click **Publish** in the Replit UI.

---

### Secrets already set in Replit Secrets panel

These are confirmed working. Do not ask the user to re-enter them.

| Secret | Status | Notes |
|---|---|---|
| `JWT_SECRET` | SET | Strong random value — server will crash on startup if missing or default |
| `ADMIN_USERNAME` | SET | Admin dashboard login |
| `ADMIN_PASSWORD` | SET | Not "admin123" — confirmed strong |
| `GAMEBOT_TOKEN` | SET | @StrykkerXBot — GameBot (player DMs, /start, /balance) |
| `GROUPBOT_TOKEN` | SET | GroupBot (community channel broadcasts) |
| `CRYPTOBOT_API_TOKEN` | SET | Verified: returns app_id=592023, name="StrikerX" from CryptoPay API |
| `DATABASE_URL` | SET | Replit-managed PostgreSQL — do not touch |

> **Note for agents:** `viewEnvVars()` in the code_execution sandbox only surfaces Replit-managed runtime secrets (DATABASE_URL, REPL_ID, etc.). It will NOT list user-added secrets like JWT_SECRET or bot tokens. This is expected — they ARE set and working (confirmed by server startup logs showing webhook registration and bot init).

---

### Non-sensitive env vars (already set as shared env vars — persist across sessions)

| Variable | Value |
|---|---|
| `TELEGRAM_GROUP_ID` | `-5141022548` |
| `MINI_APP_LINK` | `t.me/StrykkerXBot/StrikerX` |
| `OPERATOR_TON_WALLET` | `UQAokp-Xaa6wS1hxk33LMAjHaOjLsP5iQuAtAnv4K0PKdVPx` |
| `OPERATOR_USDT_TON_WALLET` | `UQAokp-Xaa6wS1hxk33LMAjHaOjLsP5iQuAtAnv4K0PKdVPx` |
| `OPERATOR_USDT_TRC20_WALLET` | `TRf9993cfY4zH4k6Q8eSUoK8cc4HzPA8cg` |

---

### What auto-configures on deploy — no manual action needed

- `WEBHOOK_DOMAIN` — code reads `process.env.REPLIT_DOMAINS` (auto-set by Replit to `*.replit.app`). Do NOT set this manually unless overriding with a custom domain.
- `CORS_ORIGIN` — same fallback. Do NOT set manually.
- Telegram bot webhooks — auto-registered on server startup using the detected domain.

---

### Deployment configuration (already set in .replit)

| Setting | Value |
|---|---|
| Target | **`vm`** (always-on — NEVER change to `autoscale`, WebSocket crash game requires persistent state) |
| Build | `pnpm install --frozen-lockfile && pnpm --filter @workspace/strikerx run build && pnpm --filter @workspace/api-server run build` |
| Run | `NODE_ENV=production PORT=5000 node --enable-source-maps artifacts/api-server/dist/index.mjs` |

---

### Step-by-step deployment

1. **Click Publish** in the Replit UI. The build runs automatically.
2. **Wait** for the build to complete (2–3 minutes). Both Telegram bot webhooks register automatically on first startup.
3. **Register CryptoBot payment webhook** (manual — CryptoPay has no API for this):
   - Open Telegram → `@CryptoBot` → `/myapps`
   - Select **StrikerX** → **Webhooks** → set URL to:
     `https://YOUR-APP.replit.app/api/payments/webhook/cryptobot`
   - The exact URL is logged on startup: look for `"CryptoBot webhook URL"` in deployment logs.
4. **Configure BotFather Mini App URL**:
   - Open `@BotFather` → `/myapps` → select your GameBot app
   - Set the Web App URL to `https://YOUR-APP.replit.app`
   - This makes `/start` open the casino UI inside Telegram.

---

### Production architecture (single port)

In production, a single Node.js process on port 5000 serves everything:
- `GET /api/*` — Express API
- `GET /ws` — WebSocket (crash game, real-time events)
- `POST /api/bots/gamebot/webhook` — GameBot Telegram webhook
- `POST /api/bots/groupbot/webhook` — GroupBot Telegram webhook
- `POST /api/payments/webhook/cryptobot` — CryptoBot payment confirmation
- `GET /*` — React SPA (served from `artifacts/strikerx/dist/public`)

In dev, API runs on port 8000 and the Vite frontend on port 5000 (which proxies `/api` and `/ws` to 8000).

---

### DO NOT do these things

- Do not change `deploymentTarget` from `vm` to `autoscale` — WebSockets require always-on.
- Do not set `WEBHOOK_DOMAIN` or `CORS_ORIGIN` as secrets/env vars — they auto-detect from `REPLIT_DOMAINS`.
- Do not run `pnpm --filter @workspace/db run push` in production — apply DDL manually via the database tool with `environment: "production"`.
- Do not edit generated files in `lib/api-client-react/src/generated/` or `lib/api-zod/src/generated/` — regenerate via `pnpm --filter @workspace/api-spec run codegen`.

---

## Run & Operate

| Command | What it does |
|---|---|
| `pnpm --filter @workspace/api-server run dev` | Run API server in dev (port 8081 per package script) |
| `pnpm --filter @workspace/strikerx run dev` | Run React Mini App frontend (port 5000 in dev) |
| `pnpm --filter @workspace/api-server run build` | Build API server to `artifacts/api-server/dist/index.mjs` |
| `pnpm --filter @workspace/strikerx run build` | Build frontend to `artifacts/strikerx/dist/public` |
| `pnpm run typecheck` | Full typecheck across all packages |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerate React Query hooks and Zod schemas from the OpenAPI spec |
| `pnpm --filter @workspace/db run push` | Push Drizzle schema to DB (dev only — never on prod) |
| `node scripts/github-push.mjs` | Push all files to GitHub via Contents API (git push is blocked in Replit) |

**Dev auth bypass:** `POST /api/auth/telegram` with `{ "initData": "dev:123456:player_dev" }` — only works when `NODE_ENV=development`.

**Dev workflow:** The `API Server` workflow runs `pnpm --filter @workspace/api-server run build` then starts the built artifact on port 8000. After any server-side code change, you must rebuild before changes take effect.

---

## Stack

- **Monorepo:** pnpm workspaces, Node.js 24, TypeScript 5.9
- **API:** Express 5, Pino logger, Helmet, express-rate-limit
- **DB:** PostgreSQL + Drizzle ORM (numeric columns return as `string` in TypeScript — always wrap with `parseFloat(String(...))`)
- **Validation:** Zod (`zod/v4`), `drizzle-zod`
- **API codegen:** Orval (OpenAPI → React Query hooks + Zod schemas)
- **Build:** esbuild (bundles to `dist/index.mjs`)
- **Frontend:** React + Vite + TailwindCSS + shadcn/ui + Framer Motion
- **Bots:** Telegraf v4 — GameBot (private DM) + GroupBot (community channel)
- **Payments:** CryptoBot API (TON/USDT/BNB/SOL deposits; withdrawal goes to player's CryptoPay balance)
- **Real-time:** Native WebSocket server at `/ws` on the same HTTP server

---

## Where things live

```
lib/
  api-spec/openapi.yaml          — OpenAPI spec (source of truth for all endpoints)
  api-client-react/src/generated/api.ts  — Generated React Query hooks
  api-zod/src/generated/api.ts   — Generated Zod schemas (server validation)
  db/src/schema/                 — Drizzle ORM schema files (one file per table group)
  db/src/index.ts                — Re-exports all tables + db client

artifacts/
  api-server/src/
    routes/                      — Express route handlers (one file per domain)
      admin.ts                   — All /admin/* endpoints (players, withdrawals, kyc, etc.)
      affiliates.ts              — Affiliate program CRUD
      auth.ts                    — Telegram auth + admin login
      bots.ts                    — Telegram webhook endpoints (/api/bots/gamebot/webhook, /api/bots/groupbot/webhook)
      games.ts                   — Penalty, Minefield, Free Kick game logic
      jackpot.ts                 — Public jackpot endpoint + admin jackpot management
      kyc.ts                     — Player KYC submit/status endpoints
      payments.ts                — CryptoBot invoice creation + webhook handler (/api/payments/webhook/cryptobot)
      players.ts                 — Player profile, stats, referral, streak, cashback
      public.ts                  — Public endpoints (match event, rate event status)
    lib/
      achievementsService.ts     — Achievement unlock logic + award dispatch
      affiliateCommission.ts     — Credit commission to affiliate owner on player win
      auth.ts                    — JWT sign/verify, requireAuth/requireAdmin middleware
      cashbackScheduler.ts       — Weekly cashback cron job
      configService.ts           — DB-backed app config key/value store (cached 60s)
      crashEngine.ts             — The Shot (crash game) singleton engine + WS lifecycle
      gameBot.ts                 — GameBot Telegraf instance (player DMs)
      gameEngine.ts              — Shared game math: VIP tiers, jackpot contribution, provably-fair RNG
      groupBot.ts                — GroupBot Telegraf instance (community channel, big-win announcements)
      logger.ts                  — Pino logger singleton
      matchEventBonus.ts         — Reads match_event_active config, returns win bonus multiplier
      referralCode.ts            — Generates unique referral codes
      wsServer.ts                — WebSocket server, broadcastToAll helper

  strikerx/src/
    pages/                       — Player-facing pages (home, games, profile, deposit, etc.)
    pages/admin/                 — Admin dashboard pages
    components/                  — Shared UI components (Layout, AdminLayout, etc.)
    lib/
      auth.tsx                   — AuthContext (token, player, adminToken, setToken, setAdminToken)
      ws-notifications.tsx       — WebSocket notification provider (real-time events)

docs/                            — Architecture, handoff notes, roadmap
scripts/github-push.mjs          — GitHub file push script (use instead of git push)
```

---

## Database schema (key tables)

| Table | Purpose |
|---|---|
| `players` | All player data — balances, VIP tier, KYC status, streak, referral/affiliate codes |
| `games` | Completed game records — gameType, betStriker, winAmount, outcome, multiplier |
| `transactions` | All financial movements — deposit, withdrawal, bet, win, cashback, referral, jackpot |
| `crash_rounds` | One row per Shot round — serverSeed, crashPoint, status, startedAt, endedAt |
| `minefield_sessions` | Active/completed Minefield sessions — minePositions, revealedPositions, currentMultiplier |
| `jackpot` | Single-row jackpot pool — currentAmountTon, status, lastWinnerId, lastTriggeredAt |
| `withdrawals` | Withdrawal requests — amountTon, status (pending/under_review/approved/rejected) |
| `tournaments` | Tournament records — startAt, endAt, prizePool, status |
| `kyc_submissions` | KYC submissions — playerId, fullName, country, docType, status |
| `affiliates` | Affiliate/influencer records — code, ownerId, commissionRate, totalEarned, totalReferred |
| `audit_log` | Admin action history — adminAction, targetPlayerId, oldValue, newValue, performedBy |
| `app_config` | DB-backed key/value config store — key, value, updatedAt |
| `achievements` | Achievement definitions — key, title, description, rarity, condition |
| `player_achievements` | Junction: which player unlocked which achievement |

---

## Token economy

| Token | Deposit rate | Withdraw rate | Purpose |
|---|---|---|---|
| STRIKER | 100/TON | 110/TON | Primary play token (10-unit spread = house edge) |
| BOOT | earned in-game | — | Secondary reward — redeemable for STRIKER |
| CAPTAIN | via achievements / events | — | Premium loyalty token (future use) |

---

## Games

| Game | Route | Payout |
|---|---|---|
| The Shot | `/games/shot` (WebSocket) | Multiplier × bet (cash out before crash) |
| Penalty | `POST /api/games/penalty` | 1.92× on win |
| Minefield | `POST /api/games/minefield/start` + pick + cashout | Compound multiplier per safe pick |
| Free Kick | `POST /api/games/freekick` | Plinko-style slot payout |

All game wins are multiplied by the active **match event bonus** (`getMatchEventBonus()` — reads `match_event_active` config).
All game wins **credit affiliate commission** to the affiliate owner if the player signed up via an affiliate code.

---

## Config keys (stored in `app_config` table)

| Key | Default | Description |
|---|---|---|
| `striker_deposit_rate` | 100 | STRIKER per 1 TON on deposit |
| `striker_withdraw_rate` | 110 | STRIKER per 1 TON on withdrawal |
| `jackpot_min_pool` | 50 | TON required to trigger jackpot |
| `jackpot_seed_amount` | 10 | TON to reset jackpot to after trigger |
| `jackpot_house_cut` | 10 | % house keeps from jackpot trigger |
| `welcome_bonus_striker` | 500 | STRIKER given to new players |
| `wager_requirement_multiplier` | 10 | Wager req = multiplier × welcome bonus |
| `big_win_announce_threshold` | 50 | Min STRIKER win to broadcast to group |
| `match_event_active` | (unset) | "true" when a match event is live |
| `match_event_ends_at` | (unset) | ISO timestamp when match event ends |
| `match_event_bonus_multiplier` | (unset) | e.g. "1.5" for 1.5× payout boost |
| `match_event_team_a` | (unset) | Label for home team |
| `match_event_team_b` | (unset) | Label for away team |
| `match_event_label` | (unset) | Event display name |
| `rate_event_active` | (unset) | "true" when a rate event is live |
| `rate_event_ends_at` | (unset) | ISO timestamp |
| `rate_event_multiplier` | (unset) | e.g. "1.5" for deposit bonus |

Use `configService.getConfig(key)`, `getConfigFloat(key, default)`, `setConfig(key, value)`.

---

## Admin panel pages

All admin routes require `Authorization: Bearer <adminToken>` with `isAdmin: true` in JWT payload.
Login at `POST /api/auth/admin/login` with `ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars.

| URL | Description |
|---|---|
| `/admin` | Login page |
| `/admin/dashboard` | Overview stats (players, revenue, jackpot) |
| `/admin/players` | Search, view, adjust balance, ban/flag, send DM, approve withdrawals |
| `/admin/withdrawals` | Pending withdrawal queue |
| `/admin/analytics` | Revenue charts + CSV export |
| `/admin/tournaments` | Create/manage tournaments |
| `/admin/jackpot` | Live jackpot stats, configure threshold, manually trigger, reset pool |
| `/admin/rate-events` | Create time-limited deposit bonus events |
| `/admin/match-events` | Create live match bonus multiplier events |
| `/admin/kyc` | Review KYC submissions — approve/reject |
| `/admin/affiliates` | Manage affiliate codes, track commissions |
| `/admin/inbox` | Log of all DMs sent to players |
| `/admin/flagged` | Players flagged for review |
| `/admin/broadcast` | Send mass Telegram message to all players |
| `/admin/config` | Edit live DB config values |
| `/admin/audit-log` | Full admin action history |

---

## Affiliates system

- Affiliates are managed in the `affiliates` table with a unique `code`, optional `ownerId` (player account), `commissionRate` (e.g. 0.10 = 10%), `totalEarned`, `totalReferred`.
- Players sign up with `affiliateCode` param in `POST /api/auth/telegram` (separate from `referralCode`).
- On new player registration: `affiliates.totalReferred++`, player's `affiliateCode` field is set.
- On every win: `affiliateCommission.ts` credits `winAmount × commissionRate` STRIKER to the affiliate owner's balance and inserts a `referral` transaction.

---

## KYC flow

1. Player visits Profile page → sees KYC status section.
2. If status is `none` or `rejected`, they fill fullName / country / docType and submit.
3. `POST /api/players/me/kyc` creates a `kyc_submissions` record with status `pending`.
4. Admin reviews at `/admin/kyc` → can approve (sets player.kycStatus = "verified") or reject.
5. Player KYC status is returned in the auth response (`/api/auth/telegram`) and `/api/players/me`.

---

## WebSocket events (client connects to `wss://<host>/ws`)

| Event | Direction | Payload |
|---|---|---|
| `round_update` | Server → Client | `{ id, status, multiplier, crashPoint, activePlayers }` |
| `player_cashout` | Server → Client | `{ playerId, username, multiplier, winAmount, roundId }` |
| `bet_placed` | Server → Client | `{ playerId, username, betStriker, roundId }` |
| `big_win` | Server → Client | `{ username, game, betStriker, winAmount, multiplier, at }` |
| `jackpot_won` | Server → Client | `{ username, amountTon, at }` |
| `match_event` | Server → Client | `{ active, label, teamA, teamB, bonusMultiplier, endsAt }` |
| `achievement_unlocked` | Server → Client | `{ playerId, username, keys, at }` |

---

## Gotchas & non-obvious decisions

- **Drizzle numeric returns strings** — always wrap with `parseFloat(String(value))` or `Number(value)`. This applies to `commissionRate`, `totalEarned`, `currentAmountTon`, etc.
- **Never use `console.log` in server code** — use `req.log` inside route handlers and `logger` (from `lib/logger.ts`) elsewhere.
- **Bots are no-ops without tokens** — they log a WARN but don't crash. Safe for dev.
- **Jackpot is a single-row table** — always `SELECT LIMIT 1` then upsert.
- **`match_event_active`** is never pre-seeded in app_config — `getConfig()` returns `""` when unset; always compare to `=== "true"`, not truthy.
- **GitHub push** — `git push` is blocked in Replit. Use `node scripts/github-push.mjs`. Requires `GITHUB_PERSONAL_ACCESS_TOKEN` secret. Run from bash shell, not from `code_execution` sandbox (PAT not available there).
- **Rate event deposit bonus** is applied in `payments.ts` webhook handler (on successful deposit), not in game logic.
- **Match event bonus** is applied in `games.ts` and `crashEngine.ts` via `getMatchEventBonus()` on every game win.
- **First withdrawal** for any player always goes to `under_review` status for manual admin approval.
- **Withdrawals send to CryptoPay balance** — `processCryptoBotTransfer` uses `user_id: telegramUserId`, not an external wallet address. Players receive funds in their CryptoPay balance, then withdraw from CryptoPay themselves. The `destinationAddress` field is stored for admin reference only.
- **Referral code vs affiliate code** — `player.referralCode` is their own code for the 2-tier player referral system; `player.affiliateCode` is the influencer code they used when signing up (separate system).
- **Codegen** — after editing `lib/api-spec/openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen`. The generated files live in `lib/api-client-react/src/generated/` and `lib/api-zod/src/generated/`. Never edit generated files directly.
- **Schema changes** — after editing `lib/db/src/schema/*.ts`, run `cd lib/db && pnpm run push` to apply to the dev database. For production DB, apply the same DDL manually via the database tool with `environment: "production"`.
- **Bot webhook registration** — handled centrally in `app.ts` IIFE after both bots are initialized. Do not add webhook registration logic in `gameBot.ts` or `groupBot.ts` — it causes duplicate registration and Telegram 429 errors.
- **CryptoBot webhook** — CryptoPay has no API to set the webhook programmatically. It must be set manually via @CryptoBot in Telegram. The server logs the correct URL on startup.
- **`viewEnvVars()` does not show user-set secrets** — only Replit runtime-managed vars (DATABASE_URL, REPL_ID, etc.) appear. JWT_SECRET, bot tokens, etc. are present but invisible to this tool. Verify they work by checking server startup logs instead.
