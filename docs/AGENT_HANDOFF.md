# StrikerX — Agent Handoff

> Last updated: Session 5 (2026-06-05)
> Read this FIRST, every session, before touching any file.

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
scripts/                 — github-push.mjs
```

---

## Running The App (Dev)

```bash
# API server (port 8080)
pnpm --filter @workspace/api-server run dev

# Frontend
pnpm --filter @workspace/strikerx run dev

# After OpenAPI changes
pnpm --filter @workspace/api-spec run codegen

# After DB schema changes
pnpm --filter @workspace/db run push
```

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
- **Admin**: `POST /api/auth/admin` with username/password. Stored as `strikerx_admin_token`.
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
| `GAMEBOT_TOKEN` | Optional | Telegraf GameBot (disabled if absent) |
| `GROUPBOT_TOKEN` | Optional | Telegraf GroupBot (disabled if absent) |
| `CRYPTOBOT_TOKEN` | Optional | CryptoBot payment API |
| `ADMIN_USERNAME` | Optional | Defaults to "admin" |
| `ADMIN_PASSWORD` | Optional | Set before going live |

**SECRETS ARE ADDED AFTER FULL FUNCTIONALITY IS CONFIRMED. Never ask for secrets during development.**

---

## GitHub

Repo: `github.com/vghaiaos-netizen/strikerx`

Push after every session:
```bash
node scripts/github-push.mjs
```

Uses **GitHub GraphQL `createCommitOnBranch` mutation** — pushes all files in atomic batches of 50. No SHA juggling. Excludes `node_modules`, `dist`, `.local`, `.agents`, `generated`. Requires `GITHUB_PERSONAL_ACCESS_TOKEN` env var.

> NOTE: The old Contents API approach (PUT per file) fails with 409 due to concurrent commits changing tree state. GraphQL mutation is the correct solution.

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

1. **Read this file first.** Every session, no exceptions.
2. **Never use `console.log` in server code** — use `req.log` in routes, `logger` elsewhere.
3. **After OpenAPI spec changes** → `pnpm --filter @workspace/api-spec run codegen`.
4. **After DB schema changes** → `pnpm --filter @workspace/db run push`.
5. **Dev auth bypass** for testing: `{ "initData": "dev:123456:player_dev" }`.
6. **Bots are disabled** until bot token env vars are set — intentional.
7. **Push to GitHub at session end** using `node scripts/github-push.mjs`.
8. **Admin login**: username `admin`, password `admin123` (env vars override).
9. **Config imports**: `appConfigTable` is from `@workspace/db` (not sub-paths). `auditLogTable` lives in `lib/db/src/schema/referrals.ts`.

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
- [x] All 4 game types (The Shot, Penalty, Minefield, Free Kick) broadcast `big_win` WS event on wins ≥ threshold or ≥ 5x
- [x] Jackpot trigger also broadcasts `jackpot_won` WS event
- [x] `NotificationsProvider` context (`lib/ws-notifications.tsx`) — connects to WS, stores last 30 notifications, auto-reconnects
- [x] `NotificationBell` component — live win count badge, dropdown panel, mark-all-read, clear-all
- [x] Notification bell wired into layout header
- [x] Verify page (`/verify`) — provably-fair crash round verification using HMAC-SHA256 with Web Crypto API
- [x] Verify page shows: server seed, hash (first 8 chars highlighted), r-value, computed vs recorded crash point, pass/fail badge
- [x] Manual seed verification (enter any seed, compute crash point independently)
- [x] `GET /api/games/rounds/:id` endpoint — reveals serverSeed only after round crashes
- [x] Verify tab added to bottom nav (5-tab layout)
- [x] Telegram GameBot fully implemented (/start, /balance, /deposit, /withdraw, /stats, /streak, /vip, /referral, /leaderboard, /help)
- [x] Telegram GroupBot fully implemented (big win alerts, jackpot alerts, withdrawal alerts, daily morning message, 30min jackpot updates)

## What's Next (Phase 5)

- [ ] Cashback system: weekly VIP cashback payout (cron-style, triggered on login or scheduled)
- [ ] Push notifications via Telegram when player wins jackpot or gets a milestone
- [ ] Tournament leaderboard real-time updates via WebSocket
- [ ] Player achievements / milestone badges
- [ ] Referral dashboard panel (how much each referee has wagered, earnings breakdown)
- [ ] Add env secrets (GAMEBOT_TOKEN, GROUPBOT_TOKEN, CRYPTOBOT_TOKEN, WEBHOOK_URL) and go live
- [ ] Deploy via Replit deployment
