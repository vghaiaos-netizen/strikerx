# StrikerX — Binary Trading Refactor Plan

**Read this file alongside `replit.md` and `docs/for-replit-agents.md` before touching any code.**

---

## Current state (as of 2026-06-14) — Phase 2 COMPLETE

All backend and frontend work for binary prediction trading is shipped to Railway production.

### What is done

**Backend:**
- [x] `lib/db/src/schema/trading.ts` — `trading_assets` and `trading_positions` tables
- [x] `artifacts/api-server/src/lib/binanceFeed.ts` — Binance WebSocket price feed (BTC/ETH/SOL/BNB/TON); geo-blocked on Replit dev (451 error, harmless — works on Railway)
- [x] `artifacts/api-server/src/lib/tradingEngine.ts` — fixed-odds engine: open position, 1s settlement scheduler, affiliate commission, big-win broadcast
- [x] `artifacts/api-server/src/routes/trading.ts` — REST endpoints with try/catch on every handler:
  - `GET /api/trading/assets` — list enabled assets + prices (no auth)
  - `GET /api/trading/prices` — current Binance price snapshot (no auth)
  - `POST /api/trading/positions` — open a position (auth required)
  - `GET /api/trading/positions/active` — open positions for player (auth) — MUST be declared before `/:id`
  - `GET /api/trading/positions` — history for player (auth)
  - `GET /api/trading/positions/:id` — single position (auth)
- [x] `artifacts/api-server/src/routes/admin.ts` — admin trading endpoints:
  - `GET /api/admin/trading/positions` — all positions with asset/outcome filters (filters actually applied)
  - `GET /api/admin/trading/stats` — aggregate stats (NULL-safe SQL)
  - `GET /api/admin/trading/assets` — list all assets
  - `PATCH /api/admin/trading/assets/:symbol` — toggle enabled, update ratios
- [x] `artifacts/api-server/src/index.ts` — DB migrations for trading tables auto-run on every server start
- [x] `artifacts/api-server/src/app.ts` — `/api/trading` rate limiter (60 req/min)

**Frontend:**
- [x] `artifacts/strikerx/src/pages/games/trading.tsx` — full trading page (auth-gated polling, price display, UP/DOWN buttons, active positions with countdown, history)
- [x] `artifacts/strikerx/src/pages/admin/trading.tsx` — admin trading dashboard (stats, positions table with filters)
- [x] `artifacts/strikerx/src/components/layout.tsx` — Trade tab added to bottom nav (2nd position)
- [x] `artifacts/strikerx/src/components/admin-layout.tsx` — Trading link added to admin sidebar
- [x] `artifacts/strikerx/src/App.tsx` — `/games/trading` and `/admin/trading` routes added

**Codegen:**
- [x] `lib/api-spec/openapi.yaml` — trading endpoints added
- [x] `lib/api-client-react/src/generated/api.ts` — hooks generated: `useGetTradingAssets`, `useGetTradingPrices`, `useGetTradingPositionsActive`, `useGetTradingPositions`, `usePostTradingPositions`

---

## Bugs fixed (important for next agent to know)

### 1. Admin positions filter was dead code
**Old code:** Built a `$dynamic()` query then ran a completely separate unfiltered `db.select()` and ignored the dynamic query entirely.
**Fix:** Use `and(...conditions)` pattern directly on the single query.

### 2. Trading routes had no try/catch
**Symptom:** Express 5 passed unhandled async throws to the global error handler → Railway logs showed "Unhandled error" + "request errored" on every API call.
**Fix:** Wrapped every route handler body in `try/catch` with a logged `res.status(500).json(...)` fallback.

### 3. trading_enabled defaulted to disabled
**Old logic:** `if (tradingEnabled !== "true") return disabled` — if the config key was missing (first boot before migration completes), this blocks ALL position opens.
**Fix:** `if (tradingEnabled === "false") return disabled` — only explicitly disabled blocks trades; missing key = enabled.

### 4. Auth-gated endpoints polled before JWT available
**Symptom:** `useGetTradingPositionsActive` and `useGetTradingPositions` fired requests before player auth completed, generating 401 errors.
**Fix:** Added `enabled: isAuthed` to both query hooks. Public endpoints (prices, assets) still poll immediately.

### 5. Admin stats SQL was not NULL-safe
**Old COALESCE:** `SUM(stake_striker) - SUM(win_amount) FILTER (WHERE outcome = 'win')` — outer COALESCE still returned NULL when table was empty.
**Fix:** Used nested `COALESCE(SUM(...), 0)` and `::double precision` casts; added `safeNum()` helper for JS-side safety.

---

## Architecture decisions (do not change)

| Decision | Rationale |
|---|---|
| Fixed odds (1.82×) not pool-based | Simpler, controlled house edge, predictable for players |
| Binance public WebSocket, no API key | Free, reliable, zero marginal cost, verifiable by players |
| Settlement on 1s interval | Simple and reliable at current scale |
| `outcome = "cancelled"` on exact same price | Refund is fairer than arbitrary win/loss on push |
| Payout ratio stored per-position at open time | Admin ratio changes don't affect in-flight positions |
| `gameType = "trading"` in gamesTable | Keeps VIP tier wager tracking and analytics working |
| `/positions/active` route declared BEFORE `/:id` | Express route ordering — "active" would match as an id param otherwise |
| `trading_enabled = "false"` disables trading | Missing key = enabled (safe default), explicit "false" = disabled |

---

## What NOT to do

- Do NOT call `setWebhook` from any new code — centralised in `app.ts`
- Do NOT use `console.log` — use `logger` (from `lib/logger.ts`) or `req.log` in routes
- Do NOT edit generated files in `lib/api-client-react/src/generated/` or `lib/api-zod/src/generated/`
- Do NOT run `pnpm --filter @workspace/db run push` against Railway — use the migration pattern in `index.ts`
- Do NOT import `zod` directly in `api-server` — it's not a direct dep and esbuild can't resolve it
- After any server change: rebuild with `pnpm --filter @workspace/api-server run build`, then push

---

## Key file locations

```
Server (trading):
  artifacts/api-server/src/lib/binanceFeed.ts     — Binance WS feed (geo-blocked on Replit dev, works on Railway)
  artifacts/api-server/src/lib/tradingEngine.ts   — openPosition(), startTradingSettlementScheduler()
  artifacts/api-server/src/routes/trading.ts      — player-facing trading REST endpoints
  artifacts/api-server/src/routes/admin.ts        — admin trading endpoints (bottom of file, before export default)

DB schema:
  lib/db/src/schema/trading.ts                    — trading_assets + trading_positions
  lib/db/src/schema/index.ts                      — re-exports trading schema

Frontend:
  artifacts/strikerx/src/pages/games/trading.tsx  — main trading page
  artifacts/strikerx/src/pages/admin/trading.tsx  — admin trading dashboard
  artifacts/strikerx/src/components/layout.tsx    — bottom nav (Trade is 2nd tab)
  artifacts/strikerx/src/components/admin-layout.tsx — admin sidebar

Codegen:
  lib/api-spec/openapi.yaml                       — OpenAPI spec (source of truth)
  lib/api-client-react/src/generated/api.ts       — generated hooks (do NOT edit)
```

---

## DB config keys (seeded by migration on first boot)

| Key | Default | Purpose |
|---|---|---|
| `trading_enabled` | `"true"` | `"false"` to disable all trading |
| `trading_available_durations` | `"30,60,300,900"` | Comma-separated seconds |
| `trading_default_duration` | `"60"` | Default contract duration |
| `trading_global_payout_ratio` | `"1.82"` | Win multiplier |
| `trading_min_stake` | `"10"` | Min STRIKER per trade |
| `trading_max_stake` | `"10000"` | Max STRIKER per trade |
| `trading_big_win_threshold` | `"1000"` | Min STRIKER win to broadcast |

Edit these at `/admin/config` in the admin dashboard, or directly via `configService.setConfig()`.

---

## WebSocket events (trading-specific)

| Event | Direction | Payload |
|---|---|---|
| `price_update` | Server → Client | `{ symbol, price, at }` |
| `trade_settled` | Server → Client (player only) | `{ positionId, assetSymbol, direction, outcome, entryPrice, exitPrice, winAmount, stakeStriker, creditAmount }` |

---

## After any change

```bash
# Server change:
pnpm --filter @workspace/api-server run build
node scripts/github-push.mjs

# Frontend change (Vite HMR in dev — just push when done):
node scripts/github-push.mjs

# OpenAPI spec change:
pnpm --filter @workspace/api-spec run codegen
# then push
```

---

## Potential future improvements

- Add a `trade_settled` WebSocket handler in the frontend to animate win/loss without waiting for the poll interval
- Add a `TradingChart` component with candlestick or line chart (needs a historical price endpoint)
- Asset management UI at `/admin/trading/assets` (the backend PATCH endpoint exists, needs a frontend page)
- Expose `trading_available_durations` config to the trading page (currently hardcoded in frontend as `[30, 60, 300, 900]`)
