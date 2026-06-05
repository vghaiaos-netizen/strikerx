# StrikerX — Agent Handoff Document

> **READ THIS FIRST.** Every future agent session starts here. This document is automatically updated at the end of each logical build phase. Zero context is ever lost.

---

## Session 1 — Foundation Complete (June 5, 2026)

### What Is Built and Working

- [x] pnpm workspace monorepo with TypeScript, Node 24
- [x] PostgreSQL database provisioned and schema pushed
- [x] Full OpenAPI spec (40+ endpoints) — `lib/api-spec/openapi.yaml`
- [x] Codegen producing React Query hooks + Zod schemas
- [x] React + Vite frontend — dark theme, football-stadium aesthetic
- [x] Express 5 API server with all routes
- [x] Both Telegraf bots (GroupBot + GameBot) initialized in the same API process
- [x] Database schema: players, transactions, games, crash_rounds, minefield_sessions, jackpot, tournaments, tournament_entries, referrals, withdrawals, audit_log, vip_cashback
- [x] JWT auth middleware — Telegram init data validation + admin login
- [x] All four game engines with provably-fair RNG:
  - The Shot (crash) — HMAC-SHA256 crash point generation
  - Penalty — 3-direction binary bet, 1.92x payout
  - Minefield — compound multiplier on safe picks
  - Free Kick (plinko) — Plinko slot distribution, 3 risk levels
- [x] Golden Boot jackpot — 1% of all bets, probabilistic trigger, 10% house cut
- [x] VIP tier system (5 tiers) — auto-upgrade based on lifetime TON wagered
- [x] Daily streak — can claim once per day, broken if >1 day gap
- [x] 2-tier referral system — relationships tracked in DB
- [x] CryptoBot deposit integration — creates invoices, webhook credits players
- [x] Withdrawal system — manual review for first withdrawal, auto-process after
- [x] Admin dashboard routes — overview, players, withdrawals, config, analytics, broadcast
- [x] GroupBot announcements — big wins, jackpot triggers, withdrawals, scheduled posts
- [x] GameBot commands — /start, /balance, /stats, /streak, /vip, /referral, /leaderboard
- [x] All documentation (README, AGENT_HANDOFF, ARCHITECTURE, ROADMAP, AGENT_RULES)
- [x] All hosting configs (railway.toml, render.yaml, Dockerfile, .env.example)

### Frontend Pages Built

**Player-facing (mobile-first, max 430px):**
- `/` — Home/Lobby: jackpot, balances, four game cards, bottom nav
- `/games/shot` — The Shot: multiplier display, bet input, cashout, polling
- `/games/penalty` — Penalty: direction selection, bet input
- `/games/minefield` — Minefield: grid, mine selector, click cells
- `/games/freekick` — Free Kick: risk selector, plinko animation, bet
- `/profile` — Profile: balances, VIP progress, streak calendar, referral, history
- `/deposit` — Deposit: currency selector, invoice generation
- `/withdraw` — Withdraw: amount, address, wager progress bar
- `/leaderboard` — Leaderboard: daily/weekly/alltime tabs, tournament card

**Admin dashboard (full-width desktop):**
- `/admin` — Login form
- `/admin/dashboard` — Overview stats cards
- `/admin/players` — Searchable player table
- `/admin/players/:id` — Player detail + actions
- `/admin/withdrawals` — Withdrawal queue, approve/reject
- `/admin/config` — House edge, rate sliders
- `/admin/analytics` — Revenue charts, game breakdown

### What Is NOT Built (Phase 2+)

- [ ] Tournament league engine (daily auto-reset, weekly, flash)
- [ ] VIP cashback cron job (weekly automated payments)
- [ ] Device fingerprint anti-fraud enforcement
- [ ] Betting speed monitoring / soft-flag
- [ ] Real exchange rate API (currently mocked)
- [ ] WebSocket for crash game real-time multiplier (currently polling every 1s)
- [ ] Redis-based online player count (currently mocked)
- [ ] CAPTCHA flow for flagged accounts
- [ ] Full admin analytics charts (frontend stubs exist)
- [ ] Full game UI polish for all four games (subagent built stubs)

---

## Architecture Summary

```
Telegram ──► GroupBot (GROUPBOT_TOKEN) ──► Express API Server ──► PostgreSQL
             GameBot (GAMEBOT_TOKEN)   ──► Express API Server ──► PostgreSQL
Telegram Mini App ──► React Frontend (/) ──► Express API /api/* ──► PostgreSQL
Admin Dashboard ──► React Frontend (/admin) ──► Express API /api/admin/*
CryptoBot Webhook ──► POST /api/payments/webhook/cryptobot
```

## API Endpoints

All routes are under `/api`. See `lib/api-spec/openapi.yaml` for full spec.

| Route | Auth | Description |
|-------|------|-------------|
| POST /auth/telegram | - | Telegram init data → JWT |
| POST /auth/admin/login | - | Admin credentials → JWT |
| GET /players/me | player | Profile |
| GET /players/me/stats | player | Game statistics |
| GET /players/me/streak | player | Streak info |
| POST /players/me/streak/claim | player | Claim daily reward |
| GET /players/me/referral | player | Referral code + earnings |
| GET /players/me/transactions | player | Transaction history |
| GET /games/shot/round | player | Current crash round state |
| POST /games/shot/bet | player | Place crash bet |
| POST /games/penalty | player | Play penalty |
| POST /games/minefield/start | player | Start minefield session |
| POST /games/minefield/:id/pick | player | Pick a square |
| POST /games/minefield/:id/cashout | player | Cash out minefield |
| POST /games/freekick | player | Play free kick |
| GET /games/history | player | Recent game history |
| POST /payments/deposit | player | Create CryptoBot invoice |
| POST /payments/withdraw | player | Request withdrawal |
| POST /payments/webhook/cryptobot | - | CryptoBot webhook |
| GET /jackpot | - | Jackpot state |
| GET /leaderboard | - | Leaderboard (daily/weekly/alltime) |
| GET /tournaments/active | - | Active tournament |
| POST /tournaments/:id/enter | player | Enter tournament |
| GET /admin/overview | admin | Live stats |
| GET /admin/players | admin | Player list |
| PATCH /admin/players/:id | admin | Update player |
| GET /admin/withdrawals | admin | Pending withdrawals |
| POST /admin/withdrawals/:id/approve | admin | Approve withdrawal |
| POST /admin/withdrawals/:id/reject | admin | Reject withdrawal |
| POST /admin/broadcast | admin | Broadcast to group |
| POST /admin/jackpot/seed | admin | Seed jackpot pool |
| POST /admin/tournament | admin | Create tournament |
| GET/PATCH /admin/config | admin | House edge config |
| GET /admin/analytics | admin | Revenue analytics |

---

## Environment Variables

All in Replit Secrets. See `.env.example` for full reference.

**Currently set:** `SESSION_SECRET`
**Must add:** `DATABASE_URL`, `GAMEBOT_TOKEN`, `GROUPBOT_TOKEN`, `CRYPTOBOT_TOKEN`, `TON_WALLET_ADDRESS`, `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `MINI_APP_LINK`

**Note:** Without `GAMEBOT_TOKEN` and `GROUPBOT_TOKEN`, bots start in disabled mode (no polling/webhooks). Add them to enable.

---

## Dev Mode Auth Bypass

For testing without a real Telegram Mini App:
```bash
POST /api/auth/telegram
{ "initData": "dev:123456:myusername" }
```
Returns a JWT for player with telegramId=123456, username=myusername. Only works in NODE_ENV=development.

---

## Known Issues / Sharp Edges

1. **Bot tokens not set yet** — bots disabled until GAMEBOT_TOKEN/GROUPBOT_TOKEN added to Secrets
2. **Crash game is simulated** — The Shot places and resolves a bet in one call (not a live shared round). For real-time multiplayer crash, WebSocket upgrade needed (Phase 2)
3. **Exchange rates mocked** — USDT/BNB/SOL deposits credited at approximate fixed rates. Need real rate API in production
4. **Admin config changes** — Not persistent across server restarts (stored in process.env). Store in DB table for persistence
5. **Player count** — "Players online" in admin overview is a mock number. Need Redis for real presence tracking

---

## Next Session

1. Read this file first
2. Run `pnpm run typecheck` to verify codebase is clean
3. Check workflow logs for any runtime errors
4. Continue from "Not Yet Built" list above
5. Recommend Phase 2 starting point: WebSocket for crash game, tournament engine, VIP cashback cron
6. Update this file before ending the session
