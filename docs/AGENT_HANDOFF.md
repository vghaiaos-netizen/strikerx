# StrikerX — Agent Handoff

> Last updated: June 23, 2026
> Read this FIRST, every session, before touching any file.
> Full dev guide: `docs/for-replit-agents.md`

---

## SESSION START — DO THIS EVERY TIME

```bash
# Workflows auto-start. If not running, the commands are:
#   "API Server"        → pnpm --filter @workspace/api-server run build && PORT=8000 NODE_ENV=development node --enable-source-maps artifacts/api-server/dist/index.mjs
#   "Start application" → PORT=5000 BASE_PATH=/ pnpm --filter @workspace/strikerx run dev

# Verify both are healthy:
curl http://localhost:8000/api/healthz   # → {"status":"ok"}
# Frontend visible at port 5000 in the preview pane
```

---

## SESSION END — DO THIS EVERY TIME

```bash
pnpm run typecheck          # fix any errors first
node scripts/github-push.mjs   # push to GitHub → Railway auto-deploys (~3 min)
```

---

## What Is StrikerX

**Binary prediction trading terminal inside Telegram**, styled around football/World Cup. Primary product: fixed-odds UP/DOWN contracts on crypto, forex, and commodities (think Pocket Option / Quotex as a Telegram Mini App). Four casino games (The Shot, Penalty, Minefield, Free Kick) are **retention tools**, not the primary product.

**Never revert the navigation structure.** `/` = Trading. `/games` = Games hub. This is intentional product design.

---

## Dev Environments

| | Replit Dev | Railway Production |
|---|---|---|
| API port | 8000 (workflow: `API Server`) | Auto via `PORT` env var |
| Frontend port | 5000 (workflow: `Start application`) | Served by Express as static |
| DB | Replit PostgreSQL (`DATABASE_URL`) | Railway PostgreSQL (separate) |
| Domain | Rotates on restart | Permanent — never changes |
| Bot webhooks | NOT registered (intentional) | Registered to Railway URL on startup |
| Auth bypass | `initData: "dev:123456:player_dev"` works | Real Telegram initData only |

---

## Navigation — 5-Tab Bottom Nav

| Tab | Route | Notes |
|---|---|---|
| Trade | `/` or `/games/trading` | PRIMARY — trading terminal |
| Markets | `/markets` | All assets + live prices |
| Games | `/games` | Hub → Shot, Penalty, Minefield, Free Kick |
| Portfolio | `/portfolio` | P&L stats, trade history, leaderboard |
| Account | `/account` | Profile, deposit/withdraw, KYC, settings |

---

## Admin

- URL: `/admin`
- Auth: `POST /api/auth/admin/login` with `ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars
- Admin username: `Blize` (capital B — case-sensitive)
- Token stored in localStorage as `strikerx_admin_token`

---

## All Backend Routes

| Router file | Key endpoints |
|---|---|
| `routes/auth.ts` | `/api/auth/telegram`, `/api/auth/admin/login` |
| `routes/players.ts` | `/api/players/me`, `/api/players/me/stats`, `/api/players/me/streak`, `/api/players/me/referral`, `/api/players/me/transactions`, `/api/players/me/portfolio`, `/api/players/me/portfolio/chart`, `/api/players/me/cashback`, `/api/players/me/boot/redeem`, `/api/players/me/kyc` |
| `routes/trading.ts` | `/api/trading/assets`, `/api/trading/prices`, `/api/trading/config`, `/api/trading/klines`, `/api/trading/positions` (open), `/api/trading/positions/active`, `/api/trading/positions` (history), `/api/trading/positions/:id` |
| `routes/demo.ts` | `/api/trading/demo/positions` (open), `/api/trading/demo/positions/active`, `/api/trading/demo/positions` (history), `/api/trading/demo/reset` |
| `routes/games.ts` | `/api/games/penalty`, `/api/games/minefield/start`, `/api/games/minefield/:id/pick`, `/api/games/minefield/:id/cashout`, `/api/games/freekick`, `/api/games/shot/round`, `/api/games/shot/bet`, `/api/games/shot/:id/cashout`, `/api/games/history` |
| `routes/payments.ts` | `/api/payments/deposit`, `/api/payments/withdraw`, `/api/payments/webhook/cryptobot` |
| `routes/jackpot.ts` | `/api/jackpot` |
| `routes/leaderboard.ts` | `/api/leaderboard`, `/api/tournaments/active`, `/api/tournaments/:id/enter` |
| `routes/admin.ts` | `/api/admin/overview`, players, withdrawals, config, analytics, audit-log, broadcast, jackpot, tournaments, trading stats, trading assets, rate-events, match-events, KYC, affiliates, inbox, flagged, outreach |
| `routes/affiliates.ts` | `/api/affiliates/*` |
| `routes/rateEvents.ts` | `/api/admin/rate-events/*` |
| `routes/outreach.ts` | `/api/admin/outreach/*` |
| `routes/bots.ts` | `/api/bots/gamebot/webhook`, `/api/bots/groupbot/webhook` |
| `routes/public.ts` | `/api/public/wc-theme` |
| `routes/health.ts` | `/api/healthz` |

---

## All Frontend Pages

### Player-facing
| Route | File |
|---|---|
| `/` | `pages/games/trading.tsx` — trading terminal (real + demo mode toggle) |
| `/markets` | `pages/markets.tsx` — all assets + live prices |
| `/games` | `pages/home.tsx` — games hub |
| `/games/shot` | `pages/games/shot.tsx` |
| `/games/penalty` | `pages/games/penalty.tsx` |
| `/games/minefield` | `pages/games/minefield.tsx` |
| `/games/freekick` | `pages/games/freekick.tsx` |
| `/portfolio` | `pages/portfolio.tsx` — P&L stats + trade history |
| `/account` | `pages/account.tsx` — profile, deposit, withdraw, KYC |
| `/loyalty` | `pages/loyalty.tsx` — VIP tier, streak, referrals |
| `/leaderboard` | `pages/leaderboard.tsx` |
| `/achievements` | `pages/achievements.tsx` |
| `/verify` | `pages/verify.tsx` — provably-fair verification |
| `/deposit` | `pages/deposit.tsx` |
| `/withdraw` | `pages/withdraw.tsx` |
| `/profile` | `pages/profile.tsx` |

### Admin (`/admin/*`)
18 pages: login, dashboard, players, withdrawals, config, analytics, audit-log, broadcast, tournaments, rate-events, flagged, match-events, kyc, affiliates, jackpot, inbox, outreach, trading, trading-assets

---

## AI Layer — Groq Key Pool

`artifacts/api-server/src/lib/groqPool.ts` — **use this for all Groq calls, never call Groq directly**.

### How the pool works
- Reads `GROQ_API_KEY_1` … `GROQ_API_KEY_5` on first call (lazy init)
- Fallback: `GROQ_API_KEY` (legacy single-key, used if no numbered keys found)
- Round-robins across available keys
- On 429: marks that key as cooling for 60 s, immediately tries next key
- If all keys cooling: throws — callers must fall back gracefully

### Adding more keys (Railway)
1. Go to Railway dashboard → StrikerX service → Variables
2. Add `GROQ_API_KEY_2 = gsk_...`, `GROQ_API_KEY_3 = gsk_...`, etc.
3. Deploy — pool picks them up automatically on restart (no code change needed)

### Current keys
- `GROQ_API_KEY_1` — set in both Replit and Railway (first key, June 2026)

### Where AI is used
| File | What it does | Fallback |
|---|---|---|
| `routes/trading.ts` | `/api/trading/ai-signal` — Llama 3.3 market signal | 503 error (consumer handles) |
| `lib/groupBot.ts` | Varied text for big win, jackpot, morning message, recap broadcasts | Static template |
| `lib/groupBot.ts` | AI market commentary scheduled 2x/day (9am + 3pm UTC) | Skip post |

### Exports from groqPool.ts
- `chatCompletion(messages, options)` — raw completion, throws on failure
- `generateText(systemPrompt, userPrompt, maxTokens)` — returns string or null (never throws)
- `getGroqPoolStatus()` — admin-safe status object (no key values exposed)

---

## GroupBot — Broadcast Events

`artifacts/api-server/src/lib/groupBot.ts`

### Scheduled jobs (all UTC)
| Time | Job |
|---|---|
| 9am daily | Morning message (AI-enhanced) |
| 9am + 3pm daily | AI market commentary |
| 12pm daily | Daily leaderboard top-3 shoutout |
| 9pm daily | Evening recap (trade count, payout, win rate) |
| Sunday 8pm | Weekly wrap (7-day stats) |
| Every 4h | Jackpot update |

### Event-driven broadcasts (fire-and-forget from calling code)
| Trigger | Function | Wired in |
|---|---|---|
| Casino big win | `broadcastBigWin` | `routes/games.ts` |
| Trading big win (≥ threshold) | `broadcastTradingBigWin` | `lib/tradingEngine.ts` |
| Trading win streak (3/5/10) | `broadcastTradingStreak` | `lib/tradingEngine.ts` |
| Jackpot won | `broadcastJackpot` | `routes/games.ts` |
| Withdrawal confirmed | `broadcastWithdrawal` | `routes/payments.ts` |
| New player registered | `broadcastWelcome` | `routes/auth.ts` |
| Tournament created | `broadcastTournamentStart` | `routes/admin.ts` |
| Tournament ended | `broadcastTournamentEnd` | `lib/scheduler.ts` |
| Rate event activated | `broadcastRateEvent` | `routes/admin.ts` |
| Match event activated | `broadcastMatchEvent` | `routes/admin.ts` |

### GroupBot commands (available in group)
- `/stats` — total player count
- `/jackpot` — force jackpot update broadcast
- `/broadcast <text>` — admin manual broadcast
- `/trade` — live prices + Open StrikerX button
- `/top5` — today's top 5 traders by winnings
- `/promo` — current rate event / match event status

### VIP promotion broadcast
Not yet auto-wired — call `broadcastVIPPromotion(username, newTier)` manually or wire into the VIP update path when needed. The function exists and is ready.

---

## Database (24 Tables)

| Table | Purpose |
|---|---|
| `players` | All player data — balances (striker, boot, captain, ton, usdt, demo_usdt), VIP, KYC, streak, referral, demo reset tracking |
| `transactions` | All financial movements — deposit, withdrawal, bet, win, cashback, referral, jackpot |
| `games` | Completed game records — type, bet, win, outcome, multiplier, affiliate_commission_paid |
| `crash_rounds` | One row per Shot round — serverSeed, crashPoint, status |
| `minefield_sessions` | Active/completed Minefield sessions |
| `jackpot` | Single-row jackpot pool — always `SELECT LIMIT 1` then upsert |
| `withdrawals` | Withdrawal requests — status: pending / under_review / approved / rejected |
| `tournaments` | Tournament records |
| `tournament_entries` | Tournament participation |
| `referrals` | 2-tier referral tracking |
| `vip_cashback` | VIP cashback records |
| `audit_log` | Admin action history |
| `app_config` | DB-backed key/value config store |
| `player_achievements` | Which player unlocked which achievement key |
| `affiliates` | Affiliate codes — commissionRate, totalEarned, totalReferred |
| `kyc_verifications` | KYC submissions (table name is `kyc_verifications` NOT `kyc_submissions`) |
| `trading_assets` | Enabled assets, payout ratios, stake limits (STRIKER + TON) |
| `trading_positions` | Real-money trade records — entry/exit price, outcome, barriers |
| `demo_positions` | Demo trade records — uses demoUsdtBalance, no real money |
| `daily_missions` | Daily mission tracking per player |
| `outreach_groups` | Telegram groups for outreach service |
| `outreach_posts` | Post records for outreach service |
| `outreach_templates` | Message templates for outreach |

---

## Trading System

- **Real trades**: STRIKER balance → settled by `tradingEngine.ts` on 1s interval
- **Demo trades**: `demo_usdt_balance` (10,000 USDT default) → settled by `demo.ts` on 1s interval → reset via `POST /api/trading/demo/reset`
- **Contract types**: UP_DOWN, EVEN_ODD, OVER_UNDER, IN_OUT
- **Assets**: BTC, ETH, SOL, BNB, TON + forex/commodities (EURUSD, GOLD, OIL, etc.)
- **Price feed**: Binance WebSocket for crypto; Yahoo Finance polling for forex — geo-blocked 451 error on Replit dev is **expected and harmless**, works on Railway
- **Payout**: 1.82× base (configurable), win-streak boost up to 1.95×
- **Settlement**: outcome = "cancelled" if exit price exactly equals entry price (fair refund on push)

---

## Schema Change Pattern (CRITICAL)

The server runs **idempotent startup migrations** on every start (`artifacts/api-server/src/index.ts`). This means ANY new environment (Railway, fork, staging) self-heals automatically — no manual DDL ever.

### Adding a new column
1. Add to `lib/db/src/schema/*.ts`
2. Run `pnpm --filter @workspace/db run push` (dev DB only)
3. Add entry to the `migrations` array in `artifacts/api-server/src/index.ts`:
   ```ts
   { name: "table.column_name", sql: `ALTER TABLE t ADD COLUMN IF NOT EXISTS col TYPE` }
   ```

### Adding a new table
1. Add to `lib/db/src/schema/*.ts`
2. Run `pnpm --filter @workspace/db run push` (dev DB only)
3. Add `CREATE TABLE IF NOT EXISTS` entry to migrations array in `index.ts`
4. Add any indexes as a separate migration entry (idempotent `CREATE INDEX IF NOT EXISTS`)

**Never run `drizzle-kit push` against Railway.** The startup migration array is the only safe path for production schema changes.

### Outreach tables history
`outreach_groups`, `outreach_templates`, `outreach_posts` were manually created on Railway on 2026-06-23 to fix a gap. They are now also in the migrations array — fully idempotent going forward.

---

## What Is Pending (Next Priority)

Completed in June 2026 session:
- Groq key pool (`groqPool.ts`) — AI never fails under load
- GroupBot overhaul — 12 new event broadcasts, 5 scheduled jobs, 3 new commands
- AI-enhanced GroupBot messages (with static fallback)
- outreach tables fixed on Railway + added to startup migrations
- GroupBot wired to trading engine (big win, streak milestones), scheduler (tournament end), admin routes (rate event, match event, tournament start)

Still pending:
1. **VIP promotion broadcast** — `broadcastVIPPromotion` exists in groupBot.ts, not yet auto-wired to VIP tier upgrade logic
2. **Rare achievement broadcast** — `broadcastRareAchievement` exists, not yet wired into `achievementsService.ts`
3. **Advanced contract types UI** — EVEN_ODD, OVER_UNDER, IN_OUT selectable in trading terminal (backend ready)
4. **Activate bots on Railway** — add `GAMEBOT_TOKEN`, `GROUPBOT_TOKEN`, `CRYPTOBOT_TOKEN` as Railway env vars (no code change needed — webhooks auto-register on startup)
5. **Add more Groq keys** — add `GROQ_API_KEY_2` through `GROQ_API_KEY_5` in Railway env vars when available
6. **Demo balance UI polish** — clear demo/real toggle with DEMO badge
7. **World Cup tournament series** — create via admin `/admin/tournaments`
8. **Outreach service deployment** — deploy outreach-service branch to Railway (separate service), then set `outreach_enabled=true` in admin config

---

## Critical Rules (Quick Reference)

- `git push` is blocked — use `node scripts/github-push.mjs` from **bash shell** (NOT code_execution sandbox)
- Never `console.log` in server code — use `req.log` (routes) or `logger` (everywhere else)
- Never edit generated files in `lib/api-client-react/src/generated/` or `lib/api-zod/src/generated/` — run codegen instead: `pnpm --filter @workspace/api-spec run codegen`
- Never `drizzle-kit push` against Railway — use the migration array in `index.ts`
- Never register Telegram webhooks from Replit dev — Railway owns them, self-heals on every deploy
- CryptoBot secret key is `CRYPTOBOT_TOKEN` (NOT `CRYPTOBOT_API_TOKEN`)
- Drizzle numeric columns return as strings — always `parseFloat(String(value))`
- `match_event_active` returns `""` when unset — compare `=== "true"`, never truthy
- pnpm-lock.yaml IS included in github-push — always run `pnpm install` after any dep change before pushing
- Dev auth bypass: `POST /api/auth/telegram` with `{ "initData": "dev:123456:player_dev" }`
