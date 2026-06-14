# StrikerX — Binary Trading Refactor Plan

**Read this file alongside `replit.md` and `docs/for-replit-agents.md` before touching any code.**

---

## What we're building

StrikerX is pivoting from a pure football casino to a **crypto prediction trading platform + crash game**. Players predict whether BTC, ETH, SOL, BNB, or TON will be UP or DOWN at expiry. The Shot (crash game) stays exactly as-is.

This is NOT a real exchange. It uses Binance public WebSocket prices for settlement but players trade against the house at fixed odds — no order book, no custody of actual crypto. Players deposit TON/USDT via CryptoBot into their STRIKER wallet and trade with that balance.

---

## What's already done (Phase 1 — complete)

- [x] `lib/db/src/schema/trading.ts` — `trading_assets` and `trading_positions` tables defined
- [x] `artifacts/api-server/src/lib/binanceFeed.ts` — Binance WebSocket price feed (BTC/ETH/SOL/BNB/TON)
- [x] `artifacts/api-server/src/lib/tradingEngine.ts` — fixed-odds engine: open position, 1s settlement scheduler, affiliate commission
- [x] `artifacts/api-server/src/routes/trading.ts` — REST endpoints: assets, prices, open position, list positions
- [x] `artifacts/api-server/src/routes/index.ts` — trading router mounted
- [x] `artifacts/api-server/src/index.ts` — Binance feed + settlement scheduler started on server init
- [x] `artifacts/api-server/src/app.ts` — `/api/trading` rate limiter added
- [x] DB migrations auto-run in `index.ts` startup (trading_assets seeded with 5 assets)
- [x] OpenAPI spec updated with trading endpoints + codegen run

---

## Phase 2 tasks (for parallel agents)

### Agent A — Backend: Admin trading management

**Files to touch:**
- `artifacts/api-server/src/routes/admin.ts` — add trading admin endpoints
- `lib/api-spec/openapi.yaml` — add admin trading endpoints (then run codegen)

**Endpoints to add:**
```
GET  /admin/trading/positions        — all positions with filters (asset, outcome, playerId)
GET  /admin/trading/assets           — list all assets (including disabled)
PUT  /admin/trading/assets/:symbol   — enable/disable asset, update payoutRatio / min/max stake
GET  /admin/trading/stats            — aggregate: total volume, win rate, house profit
```

**Notes:**
- Use existing `requireAdmin` middleware from `lib/auth.ts`
- Use `tradingAssetsTable`, `tradingPositionsTable` from `@workspace/db`
- After editing openapi.yaml, run: `pnpm --filter @workspace/api-spec run codegen`

---

### Agent B — Frontend: Trading game UI

**Files to create:**
- `artifacts/strikerx/src/pages/games/trading.tsx` — main trading page
- `artifacts/strikerx/src/components/TradingChart.tsx` — live candlestick/price chart
- `artifacts/strikerx/src/components/ActivePositions.tsx` — live position tracker

**Page: `/games/trading`**

The trading page must:
1. Show a horizontal asset selector (BTC | ETH | SOL | BNB | TON) — switches the active asset
2. Show a live price display with direction indicator (big number, green/red)
3. Show contract duration selector — tabs: 30s | 1m | 5m | 15m (durations from `trading_available_durations` config)
4. Show UP and DOWN buttons with the payout ratio (e.g. "UP × 1.82")
5. Show a stake input (STRIKER amount, validated against min/max)
6. Show the player's active open positions below the chart (live countdown to expiry)
7. Show recent settled positions (win/loss/cancelled) with price delta shown

**WebSocket events to handle:**
- `price_update` — `{ symbol, price, at }` — update the live price display
- `trade_settled` — `{ positionId, outcome, exitPrice, winAmount }` — animate win/loss result, update balance

**API hooks to use** (already generated via codegen):
- `useGetTradingAssets()` — list assets with current prices
- `useGetTradingPositions()` — player's trade history
- `useGetTradingPositionsActive()` — open positions
- `usePostTradingPositions()` — open a new position

**Design:**
- Dark mode (deep navy background) with green for UP, red for DOWN
- The active price number should be large and prominent (like a trading terminal)
- No emojis — use lucide-react icons (TrendingUp, TrendingDown, Clock, DollarSign)
- Match the existing shadcn/ui component style already used throughout the app

**Navigation:** Add "Trade" to the bottom navigation bar in `artifacts/strikerx/src/components/Layout.tsx`

---

### Agent C — Frontend: Admin trading dashboard pages

**Files to create:**
- `artifacts/strikerx/src/pages/admin/trading.tsx` — trading overview (volume, win rate, positions table)
- `artifacts/strikerx/src/pages/admin/trading-assets.tsx` — asset management (toggle enabled, edit payout ratio)

**Navigation:** Add both pages to `artifacts/strikerx/src/pages/admin/layout.tsx` (or wherever admin sidebar links live)

---

## Architecture decisions (do not change these)

| Decision | Rationale |
|---|---|
| Fixed odds (1.82x) not pool-based | Simpler to build, controlled house edge, predictable for players |
| Binance public WebSocket, no API key | Free, reliable, zero marginal cost, verifiable by players |
| Settlement on 1s interval in `tradingEngine.ts` | Simple and reliable — no queue or worker needed at current scale |
| `trading_positions.outcome = "cancelled"` on exact same price | Edge case protection — refund is fairer than arbitrary win/loss |
| Payout ratio stored per-position at open time | Prevents in-flight positions being affected by admin ratio changes |
| Logging in gamesTable with `gameType = "trading"` | Keeps existing VIP tier wager tracking and analytics working without changes |
| No early close (cashout) for binary trades | Adds complexity; binary is designed to be held to expiry |

---

## What NOT to do

- Do NOT call `setWebhook` from any new code — webhook registration is centralised in `app.ts`
- Do NOT use `console.log` — use `logger` (from `lib/logger.ts`) or `req.log` in routes
- Do NOT edit generated files in `lib/api-client-react/src/generated/` or `lib/api-zod/src/generated/`
- Do NOT run `pnpm --filter @workspace/db run push` against Railway — use the migration pattern in `index.ts` instead
- Do NOT add real exchange integration or custody of actual crypto assets
- After any server-side change: rebuild with `pnpm --filter @workspace/api-server run build`, then push with `node scripts/github-push.mjs`
- After editing `openapi.yaml`: run `pnpm --filter @workspace/api-spec run codegen` before frontend work

---

## Key file locations

```
Server (trading-specific):
  artifacts/api-server/src/lib/binanceFeed.ts     — Binance WS price feed
  artifacts/api-server/src/lib/tradingEngine.ts   — open position + settlement scheduler
  artifacts/api-server/src/routes/trading.ts      — REST API routes

DB:
  lib/db/src/schema/trading.ts                    — trading_assets + trading_positions tables
  lib/db/src/schema/index.ts                      — re-exports trading schema

Frontend (to be built in Phase 2):
  artifacts/strikerx/src/pages/games/trading.tsx  — main trading page (create this)
  artifacts/strikerx/src/components/Layout.tsx    — add "Trade" nav link here

Spec + codegen:
  lib/api-spec/openapi.yaml                       — OpenAPI spec (source of truth)
  lib/api-client-react/src/generated/api.ts       — generated hooks (do NOT edit directly)
```

---

## Dev auth bypass

`POST /api/auth/telegram` with `{ "initData": "dev:123456:player_dev" }` only works in `NODE_ENV=development`.

For the trading UI: open `/games/trading` in the Replit preview (port 5000), auth will auto-run via home.tsx, then you can open trade positions.

## After any change

```bash
# Server change:
pnpm --filter @workspace/api-server run build
node scripts/github-push.mjs

# Frontend change: Vite HMR handles it. Just push when done:
node scripts/github-push.mjs

# OpenAPI spec change:
pnpm --filter @workspace/api-spec run codegen
# then push
```
