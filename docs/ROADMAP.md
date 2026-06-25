# StrikerX — Roadmap

## Phase 1 — Core Infrastructure ✅
- [x] pnpm monorepo, TypeScript, Express 5, PostgreSQL
- [x] Dual bot architecture (GroupBot + GameBot) via Telegraf
- [x] Full database schema (23 tables)
- [x] JWT authentication (Telegram Mini App + Admin)
- [x] Four game engines (Shot, Penalty, Minefield, Free Kick) with provably-fair RNG
- [x] Golden Boot jackpot pool
- [x] VIP tier system (5 tiers, weekly cashback)
- [x] Daily streak with escalating rewards
- [x] 2-tier referral system
- [x] CryptoBot deposit integration (TON/USDT/BNB/SOL)
- [x] Withdrawal system with manual review queue
- [x] Admin dashboard API (18 endpoints)
- [x] GroupBot announcement system
- [x] Onboarding flow + language picker

## Phase 2 — Full Player UI ✅
- [x] WebSocket crash engine (The Shot) — live multiplier, shared round, SVG chart
- [x] Penalty, Minefield, Free Kick full game UIs
- [x] Home/Games hub page with jackpot banner, live wins ticker
- [x] Deposit page with QR code + CryptoBot invoice flow
- [x] Withdrawal page with wager gate
- [x] Leaderboard page (4 tabs)
- [x] Achievements page (16 badges)
- [x] Loyalty hub (/loyalty) — VIP progress, streak calendar, referral squad
- [x] Dark stadium aesthetic (navy/green/gold)

## Phase 3 — Admin Dashboard ✅
- [x] Persistent runtime config (31 keys, DB-backed, 60s cache)
- [x] Admin: overview KPIs, players, withdrawals, config, analytics, audit-log
- [x] Admin: broadcast, jackpot management, tournaments, rate events
- [x] Admin: match events, KYC review, affiliates, flagged players, inbox
- [x] Admin: outreach service management

## Phase 4 — Live Notifications + Provably Fair ✅
- [x] `broadcastToAll` + `broadcastToPlayer` WS helpers
- [x] Big win + jackpot won WS events
- [x] Achievement unlock WS events (per-player targeting)
- [x] NotificationBell component in header
- [x] Provably-fair verification page (/verify)
- [x] Telegram GameBot fully implemented (/start, /balance, /deposit, /stats, etc.)
- [x] Telegram GroupBot fully implemented (big win alerts, jackpot, daily messages)

## Phase 5 — Engagement & Retention ✅
- [x] VIP cashback cron (weekly automated payments)
- [x] Player achievements / milestone badges (achievementsService.ts)
- [x] BOOT → STRIKER redemption (Boot Shop)
- [x] Tournament scheduler (auto-end cron, prize payouts)
- [x] Daily missions system (daily_missions table)

## Phase 6 — Admin Enhancements ✅
- [x] Rate Events system (time-limited STRIKER deposit bonus windows)
- [x] Match Events system (live match bonus multiplier)
- [x] Flagged players review queue
- [x] World Cup 2026 themed UI skin (WC '26 badge, accent line, countdown)
- [x] Affiliate codes system (8 codes live on Railway)

## Phase 7 — Binary Trading (Primary Product) ✅
- [x] `trading_assets` + `trading_positions` DB tables
- [x] Binance WebSocket price feed (BTC/ETH/SOL/BNB/TON)
- [x] Forex/commodities price feed via Yahoo Finance (EURUSD, GOLD, OIL, etc.)
- [x] `tradingEngine.ts` — fixed-odds engine, 1s settlement, affiliate commission, big-win broadcast
- [x] REST: assets, prices, config, klines, positions (open/active/history/single)
- [x] Admin: trading positions list, aggregate stats, asset toggle/ratio management
- [x] Trading terminal page (`/`) — asset selector, UP/DOWN buttons, active positions countdown, history
- [x] Markets page (`/markets`) — all assets + live prices
- [x] Portfolio page (`/portfolio`) — P&L stats, trade history, leaderboard
- [x] Account page (`/account`) — profile, deposit, withdraw, KYC
- [x] **Demo trading** (`demo_positions` table, `demo_usdt_balance`) — practice with 10,000 virtual USDT, real settlement logic, reset capability
- [x] Navigation: 5-tab — Trade | Markets | Games | Portfolio | Account
- [x] Win-streak mechanic (`trading_win_streak` on players, payout boost up to 1.95×)
- [x] Contract types: UP_DOWN, EVEN_ODD, OVER_UNDER, IN_OUT
- [x] OpenAPI codegen for all trading + demo hooks
- [x] Admin trading dashboard + asset management UI

## Phase 8 — Trading Terminal Polish ✅ (Mostly complete as of June 2026)

### Completed
- [x] **Real-time `trade_settled` WS toast** — subscribe + animated win/loss overlay in trading.tsx
- [x] **`trading_available_durations` from config** — read from configService, exposed via `/api/trading/config`
- [x] **Klines chart** — candlestick/line chart with live price overlay, asset-specific decimal formatting
- [x] **Demo trading mode** — persistent demo/real toggle, `demo_usdt_balance`, reset capability
- [x] **Win streak mechanic** — `trading_win_streak` on players, payout boost up to 1.95×
- [x] **AI Auto-Trader** — `/api/trading/auto-trade/*` routes, `autoTrader.ts` singleton, panel UI with START/STOP button, risk presets (Safe/Balanced/High), session targets (5/10/20/50 trades), 60s countdown, "Active" tab connection
- [x] **Groq key pool** — `groqPool.ts` round-robins across up to 5 API keys, 429 auto-retry
- [x] **GroupBot overhaul** — 12 event broadcasts, 5 scheduled jobs, AI-enhanced messages
- [x] **Sentiment bar** — live UP/DOWN ratio for current asset shown in trading terminal
- [x] **Market sentiment API** — `/api/trading/sentiment/:symbol`
- [x] **Contract types UI** — UP_DOWN, EVEN_ODD, OVER_UNDER, IN_OUT selectable in terminal
- [x] **Position progress bars** — live countdown + winning/losing color state per active position

### Still Pending
- [ ] **Activate bots on Railway** — add `GAMEBOT_TOKEN`, `GROUPBOT_TOKEN`, `CRYPTOBOT_TOKEN` in Railway dashboard → no code change needed, webhooks auto-register on startup
- [ ] **World Cup tournament series** — create via admin `/admin/tournaments`
- [ ] **Trading leaderboard tab in /portfolio** — filter by week/month, rank by P&L % not absolute
- [ ] **KYC gate for withdrawals** — currently optional; consider requiring for amounts > X TON
- [ ] **VIP promotion broadcast** — `broadcastVIPPromotion` exists in groupBot.ts, not yet wired into VIP tier upgrade logic
- [ ] **Rare achievement broadcast** — `broadcastRareAchievement` exists, not yet wired into achievementsService.ts
- [ ] **Add more Groq keys** — add `GROQ_API_KEY_2`…`GROQ_API_KEY_5` in Railway env vars (no code change)

## Phase 9 — Growth
- [ ] Outreach service full deployment (outreach-service branch → Railway separate service, then set `outreach_enabled=true` in admin config)
- [ ] Airdrop campaign (STRIKER for early adopters)
- [ ] Social task system (share, invite, play)
- [ ] Ambassador program (top referrers with outsized commission terms)
- [ ] Push notifications for inactive players (7-day + 14-day reactivation DMs)
- [ ] World Cup prediction mini-game (pick match winner → bonus payout)
- [ ] Player vs Player challenge mode (two players bet same amount, winner takes 90%)
- [ ] Leaderboard with live position changes via WebSocket
