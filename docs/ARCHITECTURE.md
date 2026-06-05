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
│                    artifacts/api-server                        │
│                                                                │
│  /api/bots/groupbot  ──► GroupBot Telegraf instance           │
│  /api/bots/gamebot   ──► GameBot Telegraf instance            │
│  /api/auth/*         ──► JWT auth (Telegram + Admin)          │
│  /api/players/*      ──► Player profile, stats, streak        │
│  /api/games/*        ──► Shot, Penalty, Minefield, Freekick   │
│  /api/payments/*     ──► Deposits, withdrawals, webhooks       │
│  /api/jackpot        ──► Golden Boot pool                      │
│  /api/leaderboard    ──► Rankings and tournaments              │
│  /api/admin/*        ──► Admin dashboard API                   │
└───────────────────────┬───────────────────────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────────────────┐
│                  POSTGRESQL DATABASE                           │
│  players  transactions  games  crash_rounds  minefield_sessions│
│  jackpot  tournaments   tournament_entries  referrals          │
│  withdrawals  audit_log  vip_cashback                          │
└───────────────────────────────────────────────────────────────┘

External Services:
  CryptoBot API ──► Deposit invoices, TON withdrawals
  Telegram API  ──► Bot messages, Mini App
```

## Token Economy

```
TON Deposit ──► × 100 ──► STRIKER (spendable in games)
                           │
                           ├──► Bets (lost to house edge)
                           ├──► Wins (multiplier × bet)
                           ├──► Jackpot (1% of all bets)
                           ├──► Bonuses (welcome, streak)
                           └──► Withdrawal: ÷ 110 ──► TON

BOOT (loyalty — never convertible):
  Earned: 1 BOOT per 10 STRIKER wagered
  Spent: VIP upgrades, tournament entries, fee waivers

CAPTAIN (prestige — never tradeable):
  Earned: Tournament top 3 + jackpot trigger
  Displayed: Public profile trophies
```

## Revenue Streams

1. **House Edge** — 4% on every game outcome
2. **Spread** — 10 STRIKER gap between deposit and withdrawal rates (≈9% spread)
3. **Tournament Rake** — 10% of tournament bet pool
4. **Jackpot House Cut** — 10% of each jackpot trigger
5. **VIP Cashback** — Paid in STRIKER (not TON), recycled into platform

## Game Math

### The Shot (Crash)
- Crash point: `e^(-log(uniformRandom) / (1 - houseEdge/100))`
- House edge baked into distribution so expected payout = (1 - houseEdge%)

### Penalty (Binary)
- Left/Center/Right prediction
- Win pays 1.92x (4% edge): 3 choices × 1.92 = expected 0.64 ≈ 64% RTP

### Minefield
- Safe squares × multiplier calculated from: `(totalSquares - mines) / totalSquares`
- Compound multiplier after each safe pick with 4% edge reduction

### Free Kick (Plinko)
- Ball drops through peg rows
- Slot distribution weighted: `P(slot) = binomial(n, p) × edgeAdjustment`
- Risk levels shift the slot distributions (low = more center, high = more extreme)

## VIP Tiers

| Tier | Requirement | Cashback | Withdrawal |
|------|-------------|----------|------------|
| Sunday League | Default | 0% | Standard |
| Championship | 50 TON wagered | 2% weekly | Priority |
| Premier League | 200 TON wagered | 5% weekly | Priority |
| Champions League | 500 TON wagered | 8% weekly | Instant |
| World Cup | 1000 TON wagered | 8% weekly | Instant + 15% referral |

## Hosting

All three platforms read identical env vars. No code changes required.

| Platform | Config File | Notes |
|----------|-------------|-------|
| Replit | `.replit` (auto) | Dev + staging via workflows |
| Railway | `railway.toml` | One service per bot + frontend |
| Render | `render.yaml` | Web services + worker |
| Docker | `Dockerfile` | Self-hosted / VPS |
