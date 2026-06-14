# StrikerX — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        TELEGRAM                                 │
│                                                                 │
│  ┌──────────┐   ┌──────────┐   ┌────────────────────────────┐  │
│  │ GroupBot │   │ GameBot  │   │     Mini App (WebView)     │  │
│  └────┬─────┘   └────┬─────┘   └───────────┬────────────────┘  │
└───────┼──────────────┼────────────────────┼────────────────────┘
        │              │                    │
        ▼              ▼                    ▼
┌───────────────────────────────────────────────────────────────┐
│                    EXPRESS 5 API SERVER                        │
│                    artifacts/api-server  (port 8000 dev)       │
│                                                                │
│  /api/auth/*              ──► JWT auth (Telegram + Admin)     │
│  /api/players/*           ──► Profile, stats, portfolio       │
│  /api/trading/*           ──► Binary trading (real money)     │
│  /api/trading/demo/*      ──► Demo trading (virtual USDT)     │
│  /api/games/*             ──► Shot, Penalty, Minefield, Kick  │
│  /api/payments/*          ──► Deposits, withdrawals, webhooks  │
│  /api/jackpot             ──► Golden Boot pool                 │
│  /api/leaderboard         ──► Rankings and tournaments         │
│  /api/admin/*             ──► Admin dashboard API              │
│  /api/bots/gamebot/webhook ──► GameBot Telegraf webhook        │
│  /api/bots/groupbot/webhook ──► GroupBot Telegraf webhook      │
│  /ws                      ──► WebSocket (crash game + events)  │
└───────────────────────┬───────────────────────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────────────────┐
│                  POSTGRESQL DATABASE (23 tables)               │
│                                                                │
│  players   transactions   games   crash_rounds                 │
│  minefield_sessions   jackpot   withdrawals                    │
│  tournaments   tournament_entries   referrals   vip_cashback   │
│  audit_log   app_config   player_achievements   affiliates     │
│  kyc_verifications   daily_missions                            │
│  trading_assets   trading_positions   demo_positions           │
│  outreach_groups   outreach_posts   outreach_templates         │
└───────────────────────────────────────────────────────────────┘

External Services:
  Binance WebSocket ──► Live crypto prices (BTC/ETH/SOL/BNB/TON)
  Yahoo Finance     ──► Live forex/commodity prices (EURUSD/GOLD/OIL etc.)
  CryptoBot API     ──► Deposit invoices, TON withdrawals
  Telegram API      ──► Bot messages, Mini App
```

## Product Architecture

StrikerX is primarily a **binary prediction trading platform** — not a casino. The football/World Cup aesthetic is the brand. The four casino games (Shot, Penalty, Minefield, Free Kick) are retention tools between trading sessions.

### Navigation — 5-tab bottom bar (implemented in `components/layout.tsx`)
| Tab | Route | Purpose |
|---|---|---|
| Trade | `/` | PRIMARY — binary trading terminal |
| Markets | `/markets` | Asset price overview |
| Games | `/games` | Retention games hub |
| Portfolio | `/portfolio` | P&L stats + trade history |
| Account | `/account` | Profile, deposits, withdrawals |

## Token Economy

```
TON Deposit ──► × 100 ──► STRIKER (spendable in games + trading)
                           │
                           ├──► Game bets (lost to house edge)
                           ├──► Trade stakes (settled at 1.82×)
                           ├──► Jackpot (1% of all bets)
                           ├──► Bonuses (welcome, streak)
                           └──► Withdrawal: ÷ 110 ──► TON

BOOT (loyalty — earned, convertible to STRIKER):
  Earned: 1 BOOT per 10 STRIKER wagered
  Redeemed: POST /api/players/me/boot/redeem (1:1 to STRIKER)

CAPTAIN (prestige — never tradeable):
  Earned: Tournament top 3 + jackpot trigger
  Displayed: Public profile trophies

DEMO USDT (virtual — trading practice only):
  Default: 10,000 USDT per player
  Reset: POST /api/trading/demo/reset (limited resets)
  No real value — separate from real balances
```

## Trading System

### Binary Contracts
- Payout: 1.82× on win (configurable via `app_config`)
- Win-streak boost: up to 1.95× (tracked in `players.trading_win_streak`)
- Outcome cancelled (stake refunded) if exit price == entry price exactly

### Contract Types
| Type | Win condition |
|---|---|
| UP_DOWN | Exit price higher/lower than entry |
| EVEN_ODD | Last digit of exit price is even/odd |
| OVER_UNDER | Last digit of exit price ≥ 5 or < 5 |
| IN_OUT | Exit price inside/outside price barrier range |

### Price Feeds
- **Crypto** (BTC, ETH, SOL, BNB, TON): Binance public WebSocket — no API key needed
  - Geo-blocked on Replit dev (451 error) — **expected, harmless** — works on Railway
- **Forex/Commodities** (EURUSD, GBPUSD, USDJPY, GOLD, OIL): Yahoo Finance polling
- Both feeds publish `price_update` WS events to connected clients

### Settlement
- 1-second interval in `tradingEngine.ts` (real) and `demo.ts` (demo)
- On settlement: updates position record, credits balance, broadcasts `trade_settled` WS event to player
- Affiliate commission credited on every real-money win

## Game Math

### The Shot (Crash)
- Crash point: `e^(-log(uniformRandom) / (1 - houseEdge/100))`
- House edge baked into distribution so expected payout = (1 - houseEdge%)
- Multiplier ticks every 100ms via WebSocket

### Penalty (Binary)
- Left/Center/Right prediction — Win pays 1.92× (4% edge)

### Minefield
- Safe squares compound multiplier with 4% edge reduction per pick
- Session stored in DB — player can cashout anytime before hitting a mine

### Free Kick (Plinko)
- Ball drops through peg rows — slot distribution weighted by risk level

## VIP Tiers

| Tier | TON Wagered | Weekly Cashback |
|------|-------------|-----------------|
| Sunday League | Default | 0% |
| Championship | 50 TON | 2% |
| Premier League | 200 TON | 5% |
| Champions League | 500 TON | 8% |
| World Cup | 1000 TON | 8% + 15% referral |

## WebSocket Events

### Server → All Clients
| Event | Payload |
|---|---|
| `round_update` | `{ id, status, multiplier, crashPoint, activePlayers }` |
| `multiplier` | `{ multiplier, roundId }` — every 100ms during running |
| `big_win` | `{ username, game, betStriker, winAmount, multiplier, at }` |
| `jackpot_won` | `{ username, amountTon, at }` |
| `achievement_unlocked` | `{ playerId, username, keys, at }` |
| `price_update` | `{ symbol, price, at }` |

### Server → Player Only
| Event | Payload |
|---|---|
| `auth_ok` | `{ playerId, strikerBalance }` |
| `bet_accepted` | `{}` |
| `cashout_confirmed` | `{ winAmount, multiplier }` |
| `balance_update` | `{ strikerBalance }` |
| `trade_settled` | `{ positionId, assetSymbol, direction, outcome, entryPrice, exitPrice, winAmount, stakeStriker, creditAmount }` |

### Client → Server
| Type | Payload |
|---|---|
| `auth` | `{ token }` |
| `place_bet` | `{ betStriker, autoCashout? }` |
| `cashout` | `{}` |
| `ping` | `{}` |

## Hosting

**Production = Railway.** Replit = development only.

| Platform | Notes |
|---|---|
| Replit | Dev environment — API 8000, Frontend 5000, DB = Replit PostgreSQL |
| Railway | Production — `strikerx-production.up.railway.app`, bot webhooks registered here |

## Revenue Streams

1. **Trading house edge** — 18% edge (1.82× payout on binary contracts)
2. **Game house edge** — 4-8% on each game outcome
3. **Token spread** — 10 STRIKER gap (deposit at 100/TON, withdraw at 110/TON ≈ 9% spread)
4. **Tournament rake** — 10% of tournament prize pool
5. **Jackpot house cut** — 10% of each jackpot trigger
6. **VIP cashback** — paid in STRIKER (not TON), stays in platform ecosystem
