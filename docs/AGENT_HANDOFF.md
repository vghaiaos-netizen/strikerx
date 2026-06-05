# StrikerX — Agent Handoff

> Last updated: Session 2 (2026-06-05)
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
scripts/                 — github-push.mjs, etc.
```

---

## Running The App (Dev)

```bash
# API server (port 8080, proxied to /api via Replit)
pnpm --filter @workspace/api-server run dev

# Frontend (proxied to / via Replit)
pnpm --filter @workspace/strikerx run dev

# After OpenAPI changes
pnpm --filter @workspace/api-spec run codegen

# After DB schema changes
pnpm --filter @workspace/db run push

# Full typecheck (run before pushing to GitHub)
pnpm run typecheck
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

Uses GitHub contents API with SHA retry on 422. Excludes `.cache`, `node_modules`, `dist`, `.local`, `.agents`. Requires `GITHUB_PERSONAL_ACCESS_TOKEN` env var.

---

## Rules For Next Agent

1. **Read this file first.** Every session, no exceptions.
2. **Run `pnpm run typecheck` before GitHub push** — never push with type errors.
3. **Never use `console.log` in server code** — use `req.log` in routes, `logger` elsewhere.
4. **After OpenAPI spec changes** → `pnpm --filter @workspace/api-spec run codegen`.
5. **After DB schema changes** → `pnpm --filter @workspace/db run push`.
6. **Dev auth bypass** for testing: `{ "initData": "dev:123456:player_dev" }`.
7. **Bots are disabled** until bot token env vars are set — intentional.
8. **Push to GitHub at session end** using `node scripts/github-push.mjs`.

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
- [x] Admin dashboard routes
- [x] Dual Telegraf bot skeleton

### Phase 2 (Full UI)
- [x] WebSocket crash engine for The Shot
- [x] The Shot: live multiplier chart, crash history, live bets list
- [x] Penalty: SVG goal + keeper animation, zone picker
- [x] Minefield: interactive grid, mine/safe reveal, cashout multiplier
- [x] Free Kick: animated plinko board, 3 risk levels
- [x] Home: jackpot banner, balance strip, game grid, live wins ticker
- [x] Profile: VIP progress, streak calendar, referral code, stats
- [x] Deposit: QR code, invoice countdown, CryptoBot pay link
- [x] Withdraw: wager gate, destination address, TON preview
- [x] Dark stadium aesthetic throughout (navy/green/gold)

## What's Next (Phase 3)

- [ ] Admin dashboard frontend (player table, withdrawal approvals, config editor, analytics charts)
- [ ] Leaderboard page
- [ ] Real-time big-win notifications via WebSocket
- [ ] Telegram bot handlers (GameBot: /start, /balance, /deposit; GroupBot: jackpot alerts)
- [ ] Add env secrets and go live
- [ ] Deploy via Replit deployment
