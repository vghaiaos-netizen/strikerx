# StrikerX — Binary Trading Refactor Plan

**Read this file alongside `replit.md` and `docs/for-replit-agents.md` before touching any code.**

---

## Product vision

StrikerX is a **binary prediction trading terminal** inside Telegram. The app competes with Pocket Option and Quotex — fixed-payout UP/DOWN contracts on crypto, forex, and commodities. The football/World Cup aesthetic is the brand wrapper. Trading is the core product. Games are retention tools.

**Never revert the navigation structure.** `/` = Trading, `/games` = old Home. This is intentional product design, not a bug.

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

## Phase 3 — Trading terminal improvements (next up)

Priority order for next agent session:

### High priority
1. **Klines/candlestick endpoint** — `GET /api/trading/klines?symbol&interval&limit`
   - Crypto: proxy Binance REST `/api/v3/klines` (no API key needed)
   - Forex/commodities: Yahoo Finance chart API (no API key needed)
   - Feed into `TradingChart` so users see real historical candles, not a flat line

2. **Forex + commodities live feed** — EURUSD, GBPUSD, USDJPY, GOLD, OIL
   - Server-side polling every 1s via Yahoo Finance or similar free source
   - Expose via `price_update` WS event (same as crypto)
   - Add to `trading_assets` table with `forexCommoditySeed: true` flag

3. **Real-time `trade_settled` toast** — currently trading.tsx only refreshes via poll interval
   - WS event `trade_settled` is already broadcast by `tradingEngine.ts`
   - Frontend needs to subscribe and show win/loss toast immediately

### Medium priority
4. **`trading_available_durations` from config** — currently hardcoded as `[30, 60, 300, 900]` in `trading.tsx`
   - Read from `configService` key `trading_available_durations` (comma-separated string)
   - Expose via a public config endpoint or include in assets response

5. **Activate bots on Railway** — add `GAMEBOT_TOKEN`, `GROUPBOT_TOKEN`, `CRYPTOBOT_TOKEN` secrets in Railway dashboard
   - No code change needed — bots auto-register webhooks on Railway startup

6. **World Cup tournament series** — use existing admin tournaments UI

## After any change — mandatory steps

```bash
# After any server-side change:
pnpm --filter @workspace/api-server run build
node scripts/github-push.mjs

# After any frontend change (Vite HMR handles dev; push when done):
node scripts/github-push.mjs

# After any OpenAPI spec change:
pnpm --filter @workspace/api-spec run codegen
node scripts/github-push.mjs

# After any package.json change (add/remove/upgrade dep):
pnpm install                    # updates pnpm-lock.yaml
node scripts/github-push.mjs   # lockfile is now included — Railway will succeed

# Full typecheck before any push:
pnpm run typecheck
```
