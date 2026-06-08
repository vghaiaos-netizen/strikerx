# StrikerX

A football-themed Telegram Mini App casino platform with four original games, three-tier virtual token economy (STRIKER / BOOT / CAPTAIN), multi-currency crypto payments via CryptoBot, dual Telegram bot architecture, and a private admin dashboard. Stake.com meets Hamster Kombat — living entirely inside Telegram.

## User preferences

- No emojis in UI — use lucide-react icons instead
- Dark mode first (deep navy/black, vibrant green, gold accents — football stadium aesthetic)

---

## Run & Operate

| Command | What it does |
|---|---|
| `pnpm --filter @workspace/api-server run dev` | Run the API server (port 8081 in dev) |
| `pnpm --filter @workspace/strikerx run dev` | Run the React Mini App frontend (port 8080 in dev) |
| `pnpm run typecheck` | Full typecheck across all packages |
| `pnpm run build` | Typecheck + build all packages |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerate React Query hooks and Zod schemas from the OpenAPI spec |
| `pnpm --filter @workspace/db run push` | Push Drizzle schema to DB (dev only — never on prod) |
| `node scripts/github-push.mjs` | Push all files to GitHub via Contents API (git push is blocked in Replit) |

**Dev auth bypass:** `POST /api/auth/telegram` with `{ "initData": "dev:123456:player_dev" }` — only works when `NODE_ENV=development`.

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
- **Payments:** CryptoBot API (TON/USDT/BNB/SOL deposits; withdrawal managed manually)
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
      bots.ts                    — Telegram webhook endpoints
      games.ts                   — Penalty, Minefield, Free Kick game logic
      jackpot.ts                 — Public jackpot endpoint + admin jackpot management
      kyc.ts                     — Player KYC submit/status endpoints
      payments.ts                — CryptoBot invoice creation + webhook handler
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
Login at `POST /api/auth/admin/login` with `ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars (default: admin/admin123).

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

## Deployment checklist

Set these environment variables before going live:

| Env var | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string |
| `JWT_SECRET` | Yes | Random 256-bit secret for signing tokens |
| `GAMEBOT_TOKEN` | Yes | Telegram bot token for GameBot (player DMs) |
| `GROUPBOT_TOKEN` | Yes | Telegram bot token for GroupBot (community channel) |
| `TELEGRAM_GROUP_ID` | Yes | Telegram group/channel ID for announcements |
| `CRYPTOBOT_API_TOKEN` | Yes | CryptoBot API token for payment invoices |
| `WEBHOOK_DOMAIN` | Yes | Production domain (e.g. `strikerx.replit.app`) — auto-registers Telegram webhooks on startup |
| `CORS_ORIGIN` | Yes | Allowed origins (comma-separated), e.g. `https://strikerx.replit.app` |
| `ADMIN_USERNAME` | Yes | Admin login username |
| `ADMIN_PASSWORD` | Yes | Admin login password |
| `STRIKER_DEPOSIT_RATE` | No | Default 100 — overrides DB config |
| `JACKPOT_SEED_AMOUNT` | No | Default 10 TON |
| `JACKPOT_MIN_POOL` | No | Default 50 TON |

---

## Gotchas & non-obvious decisions

- **Drizzle numeric returns strings** — always wrap with `parseFloat(String(value))` or `Number(value)`. This applies to `commissionRate`, `totalEarned`, `currentAmountTon`, etc.
- **Never use `console.log` in server code** — use `req.log` inside route handlers and `logger` (from `lib/logger.ts`) elsewhere.
- **Bots are no-ops without tokens** — they log a WARN but don't crash. Safe for dev.
- **Jackpot is a single-row table** — always `SELECT LIMIT 1` then upsert.
- **`match_event_active`** is never pre-seeded in app_config — `getConfig()` returns `""` when unset; always compare to `=== "true"`, not truthy.
- **GitHub push** — `git push` is blocked in Replit. Use `node scripts/github-push.mjs`. Requires `GITHUB_PERSONAL_ACCESS_TOKEN` env var (set in Replit secrets). Run from bash shell, not from `code_execution` sandbox (PAT not available there).
- **Rate event deposit bonus** is applied in `payments.ts` webhook handler (on successful deposit), not in game logic.
- **Match event bonus** is applied in `games.ts` and `crashEngine.ts` via `getMatchEventBonus()` on every game win.
- **First withdrawal** for any player always goes to `under_review` status for manual admin approval.
- **Referral code vs affiliate code** — `player.referralCode` is their own code for the 2-tier player referral system; `player.affiliateCode` is the influencer code they used when signing up (separate system).
- **Codegen** — after editing `lib/api-spec/openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen`. The generated files live in `lib/api-client-react/src/generated/` and `lib/api-zod/src/generated/`. Never edit generated files directly.
- **Schema changes** — after editing `lib/db/src/schema/*.ts`, run `cd lib/db && pnpm run push` to apply to the dev database. For production DB, apply the same DDL manually via the database tool with `environment: "production"`.
