# StrikerX — Agent Handoff

> Last updated: June 14, 2026
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

## Database (23 Tables)

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

Any new column needs **TWO** things — both are required:

1. Add to `lib/db/src/schema/*.ts` → run `pnpm --filter @workspace/db run push` (dev DB)
2. Add an `IF NOT EXISTS` entry to the `migrations` array in `artifacts/api-server/src/index.ts` (runs on every Railway startup, safe to repeat)

**Never run `drizzle-kit push` against Railway.** The startup migration array is the only safe path for production schema changes.

---

## What Is Pending (Next Priority)

From `docs/refactor-plan.md` Phase 3:
1. Real-time `trade_settled` WS toast on frontend (WS event exists in tradingEngine, frontend only polls)
2. `trading_available_durations` from DB config (currently hardcoded as `[30, 60, 300, 900]` in trading.tsx)
3. Activate bots on Railway — add `GAMEBOT_TOKEN`, `GROUPBOT_TOKEN`, `CRYPTOBOT_TOKEN` in Railway dashboard (no code change needed)
4. Klines/candlestick chart improvements
5. World Cup tournament series via admin dashboard

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
