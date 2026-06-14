# StrikerX — Agent Handoff

> Last updated: Session 6 (2026-06-05)
> Read this FIRST, every session, before touching any file.

---

## SESSION START — DO THIS EVERY TIME

These three steps are mandatory at the start of every session. Do not skip any of them.

```bash
# 1. Push DB schema (safe to run even if nothing changed — idempotent)
pnpm --filter @workspace/db run push

# 2. Start API server (port 8081, console workflow)
# Workflow name: "API Server"
# Command: PORT=8081 pnpm --filter @workspace/api-server run dev

# 3. Start frontend (port 8080, webview workflow)
# Workflow name: "StrikerX Frontend"
# Command: PORT=8080 BASE_PATH=/ pnpm --filter @workspace/strikerx run dev
```

> Both workflows are pre-configured with `autoStart: true` and will usually already be running.
> If they are NOT running, create them with the exact commands above using `configureWorkflow()`.
> Always run the DB push regardless — it's idempotent and costs nothing.

### Verify everything is healthy
```bash
curl http://localhost:8081/api/healthz   # → {"status":"ok"}
curl http://localhost:8080/              # → 200 HTML
```

### Admin dashboard
- URL: `https://<repl-domain>/admin`
- Login: `admin` / `admin123`
- Admin auth endpoint: `POST /api/auth/admin/login` (NOT /api/auth/admin)

---

## SESSION END — DO THIS EVERY TIME

```bash
node scripts/github-push.mjs
```

Pushes all 232+ files to `github.com/vghaiaos-netizen/strikerx` atomically via GraphQL.
Requires `GITHUB_PERSONAL_ACCESS_TOKEN` secret (already set in Replit secrets).

---

## What Is StrikerX

Football-themed Telegram Mini App casino. Four original games, virtual token economy (STRIKER / BOOT / CAPTAIN), dual Telegram bot architecture, CryptoBot crypto payments, shared jackpot, VIP tiers, daily streaks, 2-tier referrals, private admin dashboard.

**Stake.com × Hamster Kombat — lives entirely inside Telegram.**

---

## Monorepo Layout

```
artifacts/api-server/    — Express 5 + Pino + WebSocket (Node.js 24)
artifacts/strikerx/      — React + Vite + TailwindCSS + shadcn/ui (Mini App)
lib/api-spec/            — openapi.yaml (source of truth)
lib/api-client-react/    — Generated React Query hooks
lib/api-zod/             — Generated Zod schemas (server validation)
lib/db/                  — Drizzle ORM + PostgreSQL schema
docs/                    — This file + ARCHITECTURE.md + ROADMAP.md
scripts/                 — github-push.mjs, post-merge.sh
```

---

## Port Architecture (Dev)

| Service | Internal Port | Notes |
|---------|--------------|-------|
| StrikerX Frontend (Vite) | 8080 | External port 80 — what the user sees |
| API Server (Express) | 8081 | Proxied through Vite at `/api` and `/ws` |

Vite (`artifacts/strikerx/vite.config.ts`) proxies:
- `/api/*` → `http://localhost:8081`
- `/ws` → `ws://localhost:8081` (WebSocket)

The frontend never talks directly to port 8081 — all traffic goes through the Vite dev server proxy.

---

## Architecture: WebSocket Crash Game (The Shot)

The Shot (crash game) uses WebSocket. All other games are standard REST.

### WebSocket Server
- Mounted on the same HTTP server as Express via `initWebSocketServer(httpServer)` in `src/index.ts`
- Lives at `/ws` — clients connect via `wss://host/ws` in production, `ws://host/ws` in dev
- Auth: client sends `{ type: "auth", token: "<JWT>" }` immediately on open
- File: `artifacts/api-server/src/lib/wsServer.ts`

### Crash Engine
- File: `artifacts/api-server/src/lib/crashEngine.ts`
- Shared singleton — one round active for the whole process
- Round lifecycle: `waiting (5s) → running (multiplier ticks every 100ms) → crashed`
- DB: every round saved to `crash_rounds`, every bet to `crash_bets`
- Multiplier formula: `e^(0.00006 × elapsed_ms)` — doubles roughly every ~11.5s
- Crash point: provably-fair seeded RNG (HMAC-SHA256)

### WebSocket Events (Server → Client)
| Event | Payload | When |
|-------|---------|------|
| `round_state` | `{ id, status, multiplier, crashPoint, startedAt, activePlayers }` | On connect + each new round |
| `multiplier` | `{ roundId, multiplier }` | Every 100ms while running |
| `bet_placed` | `{ playerId, username, betStriker }` | When any player bets |
| `player_cashout` | `{ roundId, playerId, username, multiplier, winAmount }` | On cashout |
| `round_crashed` | `{ roundId, crashPoint }` | On crash |
| `bet_accepted` | `{}` | Sent only to the betting player |
| `cashout_confirmed` | `{ winAmount, multiplier }` | Sent only to the cashing-out player |
| `balance_update` | `{ strikerBalance }` | After any balance change |
| `error` | `{ message }` | On invalid action |

### WebSocket Messages (Client → Server)
| Type | Payload | Action |
|------|---------|--------|
| `auth` | `{ token }` | Authenticate the connection |
| `place_bet` | `{ betStriker, autoCashout? }` | Bet on current round |
| `cashout` | `{}` | Cash out current bet |
| `ping` | `{}` | Keepalive (server replies `pong`) |

---

## Auth

- **Players**: JWT from `POST /api/auth/telegram`. Stored as `strikerx_token` in localStorage.
- **Dev bypass**: `{ "initData": "dev:123456:player_dev" }` — creates/returns player (id 123456, username player_dev). Gives 500 STRIKER on first login.
- **Admin**: `POST /api/auth/admin/login` with `{ username, password }`. Stored as `strikerx_admin_token`.
- **JWT secret**: `SESSION_SECRET` env var.

---

## Game Pages (all complete with full UI)

| Page | Route | Backend | Notes |
|------|-------|---------|-------|
| The Shot | `/games/shot` | WebSocket `/ws` | Live shared crash round, SVG chart, live bet list |
| Penalty | `/games/penalty` | `POST /api/games/penalty` | SVG goal + keeper animation, zone picker |
| Minefield | `/games/minefield` | REST start/pick/cashout | Interactive grid, compound multiplier |
| Free Kick | `/games/freekick` | `POST /api/games/freekick` | Animated plinko board, 3 risk levels |

---

## Token Economy

| Token | Role | Rate |
|-------|------|------|
| STRIKER | Main game currency | 100 per TON deposited, 110 per TON withdrawn |
| BOOT | VIP/referral rewards | Converted to STRIKER at 1:1 |
| CAPTAIN | Premium loyalty | Earned via jackpot/milestone |

The 10-STRIKER spread (deposit 100/TON, withdraw 110/TON) is intentional house revenue.

---

## Environment Variables

| Var | Required | Notes |
|-----|----------|-------|
| `DATABASE_URL` | YES | Postgres connection string |
| `SESSION_SECRET` | YES | JWT signing secret |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | YES | GitHub GraphQL push — already set |
| `GAMEBOT_TOKEN` | Optional | Telegraf GameBot (disabled if absent) |
| `GROUPBOT_TOKEN` | Optional | Telegraf GroupBot (disabled if absent) |
| `CRYPTOBOT_TOKEN` | Optional | CryptoBot payment API |
| `ADMIN_USERNAME` | Optional | Defaults to "admin" |
| `ADMIN_PASSWORD` | Optional | Defaults to "admin123" in code |

All required secrets are already set in Replit. Never ask the user for credentials.

---

## GitHub

Repo: `github.com/vghaiaos-netizen/strikerx`

Push at end of every session:
```bash
node scripts/github-push.mjs
```

Uses **GitHub GraphQL `createCommitOnBranch` mutation** — pushes all files in atomic batches of 50. No SHA juggling. Excludes `node_modules`, `dist`, `.local`, `.agents`, `generated`. Requires `GITHUB_PERSONAL_ACCESS_TOKEN` env var (already set).

> NOTE: `git push` is blocked in Replit. The only working push mechanism is `node scripts/github-push.mjs`. Do not attempt any other approach.

---

## Admin Dashboard (fully built)

### Backend Routes (`artifacts/api-server/src/routes/admin.ts`)
| Route | Description |
|-------|-------------|
| `GET /api/admin/overview` | KPIs: revenue, players, bets, jackpot |
| `GET /api/admin/players` | Searchable/filterable player list |
| `GET /api/admin/players/:id` | Full player detail |
| `POST /api/admin/players/:id/balance` | Adjust player balance |
| `GET /api/admin/withdrawals` | All withdrawals (filterable by status) |
| `POST /api/admin/withdrawals/:id/approve` | Approve withdrawal |
| `POST /api/admin/withdrawals/:id/reject` | Reject with reason |
| `GET /api/admin/config` | All runtime config keys |
| `PUT /api/admin/config/:key` | Update single config value |
| `PUT /api/admin/config` | Bulk update config values |
| `GET /api/admin/analytics` | Revenue/bets/players time series |
| `GET /api/admin/audit-log` | Admin action history |
| `POST /api/admin/broadcast` | Send message to all players |
| `POST /api/admin/jackpot/seed` | Manually seed jackpot pool |
| `GET /api/admin/tournaments` | Tournament list |
| `POST /api/admin/tournaments` | Create tournament |
| `POST /api/admin/tournaments/:id/end` | End tournament, pay out |

### Config Service (`artifacts/api-server/src/lib/configService.ts`)
- `app_config` DB table holds 31 runtime keys across 8 categories
- 15-second in-memory cache (changes reflect within 15s)
- `initConfig()` called on startup in `app.ts`
- Use `getConfig(key)` / `setConfig(key, value)` anywhere in the API server

### Frontend Admin Pages (`artifacts/strikerx/src/pages/admin/`)
| File | Page |
|------|------|
| `dashboard.tsx` | KPI cards + Recharts revenue/bets/players charts |
| `players.tsx` | Searchable table + player detail dialog + balance adjustment |
| `withdrawals.tsx` | Status tabs (pending/approved/rejected) + approve/reject actions |
| `config.tsx` | Category sidebar + all 31 config keys + secret masking + save-all |
| `analytics.tsx` | Multi-chart time-series analytics (7/30/90 day) |
| `audit-log.tsx` | Paginated admin action history |
| `broadcast.tsx` | Message templates + preview + send to all players |
| `tournaments.tsx` | Create/end/view live tournament cards |

Admin layout: `artifacts/strikerx/src/components/admin/admin-layout.tsx`
Admin login: `artifacts/strikerx/src/pages/admin/login.tsx`

---

## Rules For Next Agent

1. **Run the SESSION START checklist** (top of this doc) before touching any file.
2. **Never use `console.log` in server code** — use `req.log` in routes, `logger` elsewhere.
3. **After OpenAPI spec changes** → `pnpm --filter @workspace/api-spec run codegen`.
4. **After DB schema changes** → `pnpm --filter @workspace/db run push`.
5. **Dev auth bypass** for testing: `{ "initData": "dev:123456:player_dev" }`.
6. **Bots are disabled** until bot token env vars are set — intentional.
7. **Push to GitHub at session end** using `node scripts/github-push.mjs`.
8. **Admin login**: `POST /api/auth/admin/login` — username `admin`, password `admin123`.
9. **Config imports**: `appConfigTable` is from `@workspace/db` (not sub-paths). `auditLogTable` lives in `lib/db/src/schema/referrals.ts`.
10. **Never edit `.replit` directly** — it's blocked. Set ports via workflow command env vars (`PORT=8081 ...`).
11. **Workflow names**: "API Server" and "StrikerX Frontend" — these names are registered and autoStart.

---

## What's Done

### Phase 1 (Core Platform)
- [x] Full Express 5 API with JWT auth, Pino logging
- [x] PostgreSQL + Drizzle ORM schema (all tables)
- [x] OpenAPI spec + codegen pipeline
- [x] All four game endpoints with provably-fair RNG
- [x] Golden Boot jackpot (probabilistic trigger, seeded pool)
- [x] VIP tier system (5 tiers based on TON wagered)
- [x] Daily streak rewards with milestone bonuses
- [x] 2-tier referral system (10% / 5% lifetime)
- [x] CryptoBot deposit integration
- [x] Withdrawal queue with manual review
- [x] Dual Telegraf bot skeleton

### Phase 2 (Full Player UI)
- [x] WebSocket crash engine for The Shot
- [x] The Shot: live multiplier chart, crash history, live bets list
- [x] Penalty: SVG goal + keeper animation, zone picker
- [x] Minefield: interactive grid, mine/safe reveal, cashout multiplier
- [x] Free Kick: animated plinko board, 3 risk levels
- [x] Home: jackpot banner, balance strip, game grid, live wins ticker
- [x] Profile: VIP progress, streak calendar, referral code, stats
- [x] Deposit: QR code, invoice countdown, CryptoBot pay link
- [x] Withdraw: wager gate, destination address, TON preview
- [x] Leaderboard: 4 tabs (wagered / wins / streak / referrals)
- [x] Dark stadium aesthetic throughout (navy/green/gold)

### Phase 3 (Admin Dashboard)
- [x] Persistent runtime config system (31 keys, DB-backed, 15s cache)
- [x] All admin API routes (overview, players, withdrawals, config, analytics, audit-log, broadcast, jackpot, tournaments)
- [x] Admin dashboard: KPI cards + Recharts charts
- [x] Admin players: searchable table + detail dialog + balance adjustment
- [x] Admin withdrawals: tabbed status view + approve/reject
- [x] Admin config: all 31 keys with secret masking + bulk save
- [x] Admin analytics: multi-chart time-series
- [x] Admin audit log: paginated history
- [x] Admin broadcast: templates + preview + send
- [x] Admin tournaments: create/end/live cards
- [x] GitHub push fixed (GraphQL createCommitOnBranch — atomic, reliable)

### Phase 4 (Live Notifications + Provably Fair)
- [x] `broadcastToAll(event, data)` exported from wsServer — any module can push to all WS clients
- [x] All 4 game types broadcast `big_win` WS event on wins ≥ threshold or ≥ 5x
- [x] Jackpot trigger broadcasts `jackpot_won` WS event
- [x] `NotificationsProvider` context (`lib/ws-notifications.tsx`) — connects to WS, stores last 30 notifications, auto-reconnects
- [x] `NotificationBell` component — live win count badge, dropdown panel, mark-all-read, clear-all
- [x] Notification bell wired into layout header
- [x] Verify page (`/verify`) — provably-fair crash round verification using HMAC-SHA256 with Web Crypto API
- [x] `GET /api/games/rounds/:id` endpoint — reveals serverSeed only after round crashes
- [x] Verify tab added to bottom nav (5-tab layout)
- [x] Telegram GameBot fully implemented (/start, /balance, /deposit, /withdraw, /stats, /streak, /vip, /referral, /leaderboard, /help)
- [x] Telegram GroupBot fully implemented (big win alerts, jackpot alerts, withdrawal alerts, daily morning message, 30min jackpot updates)

### Phase 5 (Engagement & Retention) ✅
- [x] Cashback system: weekly VIP cashback payout with REST claim endpoint
- [x] Player achievements / milestone badges (16 badges, `player_achievements` table)
- [x] Referral dashboard panel (referee list + earnings breakdown)
- [x] Tournament leaderboard REST endpoint
- [x] Achievements page (`/achievements`) with rarity rings and progress
- [x] Profile: cashback card, achievements preview, referral squad section

### Phase 6 (Live Achievement Notifications + Boot Shop) ✅
- [x] `broadcastToPlayer(playerId, event, data)` added to wsServer.ts — targeted WS delivery
- [x] `achievement_unlocked` WS event broadcast from all 4 game types + streak claim
- [x] The Shot (crashEngine.ts) — achievement triggers on bet placed + cashout (first_bet, crash_5x/25x/100x, centurion, high_roller, vip upgrades, big_winner)
- [x] Penalty, Minefield, Free Kick — fire-and-forget achievements broadcast `achievement_unlocked` to all
- [x] Streak claim triggers `lucky_7` and `streak_legend` achievements
- [x] `ws-notifications.tsx` — authenticates WS on open (sends JWT), stores `myPlayerId` from `auth_ok`, filters `achievement_unlocked` by playerId, handles `tournament_ended`
- [x] `ACHIEVEMENT_MAP` mirrored to `artifacts/strikerx/src/lib/achievement-defs.ts`
- [x] `NotificationBell` updated — distinct icons for achievement_unlocked, jackpot_won, tournament_ended
- [x] Boot Shop UI in profile — expandable form to convert BOOT → STRIKER at 1:1 (only shown if bootBalance > 0)
- [x] `POST /players/me/boot/redeem` backend route + OpenAPI spec + codegen
- [x] Scheduler (`artifacts/api-server/src/lib/scheduler.ts`) — tournament auto-end cron (every 60s), pays top-5 prizes, broadcasts `tournament_ended`
- [x] `startScheduler()` called in `index.ts` after crash engine starts

### Phase 7 (Admin Enhancements) ✅
- [x] Admin Rate Events system — `GET/POST /admin/rate-events/status/start/end` using configService
- [x] Admin Rate Events page (`/admin/rate-events`) — launch limited-time STRIKER deposit bonus windows with countdown timer
- [x] Admin Flagged Players page (`/admin/flagged`) — list flagged players, one-click clear/ban actions
- [x] `POST /admin/players/:id/flag` — flag/unflag any player with reason + audit log
- [x] `GET /admin/flagged` — list all currently flagged players
- [x] Admin layout updated with Rate Events + Flagged nav items
- [x] App.tsx wired with `/admin/rate-events` and `/admin/flagged` routes

### Phase 8 ✅
- [x] Deposit page rate event banner — already fully built (deposit.tsx line 117, /api/public/rate-event)
- [x] Push notifications via Telegram for jackpot wins + achievement milestones — already wired (services/telegramNotify.ts, called from games.ts + crashEngine.ts)
- [x] World Cup themed UI skin — BUILT:
  - `GET /api/public/wc-theme` — returns { active, live, countdown, kickOff, endsAt } (auto date range Jun 11–Jul 19 2026; admin can override with `wc_edition_active` config key)
  - `layout.tsx` — "WC '26" red badge next to logo + red accent underline across header, active on all pages
  - `home.tsx` — live countdown banner (DD/HH/MM/SS blocks) before Jun 11 kick-off; switches to "THE TOURNAMENT IS LIVE" once started; game section relabelled "WC ORIGINALS 2026"
  - Layout fetches its own WC state so all pages inherit the badge automatically (shared React Query cache key `["wc-theme"]`)

### Binary Trading — Phase 2 ✅ (completed 2026-06-14)
- [x] `trading_assets` + `trading_positions` DB tables
- [x] Binance WS price feed (BTC/ETH/SOL/BNB/TON) — geo-blocked on Replit dev (expected), works on Railway
- [x] `tradingEngine.ts` — fixed-odds engine, 1s settlement scheduler, affiliate commission, big-win broadcast
- [x] REST endpoints: assets, prices, positions (open/active/history/single)
- [x] Admin trading endpoints: positions list, aggregate stats, asset toggle/ratio management
- [x] `trading.tsx` — full trading page (asset selector, UP/DOWN buttons, payout display, active positions with countdown, history)
- [x] `admin/trading.tsx` — admin trading dashboard
- [x] `admin/trading-assets.tsx` — asset management UI
- [x] `TradingChart` component using `lightweight-charts` (candlestick + line, timeframe selector)
- [x] Route restructure: `/` → Trading (primary), `/games` → old Home (secondary)
- [x] Bottom nav: Trade first, then Games, Wallet, Loyalty, Profile
- [x] Win-streak mechanic: `trading_win_streak` on players table, payout boost up to 1.95×
- [x] WS reauth fix: `useDevAuth()` extracted to `use-telegram-auth.ts`, called from `App.tsx` (always mounted)
- [x] OpenAPI codegen: `useGetTradingAssets`, `useGetTradingPrices`, `useGetTradingPositionsActive`, `useGetTradingPositions`, `usePostTradingPositions`

### Phase 9 (Next — binary trading improvements)
The platform is now a binary trading app. All future work should serve the trading product:
- [ ] Candlestick klines endpoint (`GET /api/trading/klines?symbol&interval&limit`) — Binance REST proxy for crypto, Yahoo Finance for forex/commodities
- [ ] Forex + commodities live price feed (EURUSD, GBPUSD, GOLD, OIL, etc.) — server-side polling, no API key needed
- [ ] Real-time `trade_settled` WS toast in trading.tsx (currently only refreshes via poll)
- [ ] Expose `trading_available_durations` config to trading page (currently hardcoded as [30, 60, 300, 900])
- [ ] Add env secrets (GAMEBOT_TOKEN, GROUPBOT_TOKEN, CRYPTOBOT_TOKEN) on Railway and activate bots
- [ ] World Cup special tournament series (admin → /admin/tournaments)

### Lockfile discipline — CRITICAL (added 2026-06-14)
`pnpm-lock.yaml` was never being pushed to GitHub (it was in `SKIP_FILES` in `github-push.mjs`). This caused every Railway build to fail after any dep change. **Fixed:** lockfile is now included in all pushes.

**Rule:** Any time any `package.json` changes → run `pnpm install` → then push. Never push dep changes without the lockfile.
