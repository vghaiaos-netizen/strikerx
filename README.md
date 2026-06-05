# StrikerX

StrikerX is a football-themed Telegram Mini App casino platform featuring four original games, a three-tier virtual token economy (STRIKER / BOOT / CAPTAIN), multi-currency crypto payments via CryptoBot, dual Telegram bot architecture, a self-sustaining community engine, and a private admin dashboard. The north star: Stake.com meets Hamster Kombat — living entirely inside Telegram.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 24, TypeScript 5.9 |
| Package manager | pnpm workspaces |
| API | Express 5 |
| Database | PostgreSQL + Drizzle ORM |
| Validation | Zod (`zod/v4`), `drizzle-zod` |
| Frontend | React + Vite + TailwindCSS |
| Bots | Telegraf v4 |
| Payments | CryptoBot API |
| API codegen | Orval (from OpenAPI spec) |
| Build | esbuild (CJS bundle) |

---

## Monorepo Structure

```
/
├── artifacts/
│   ├── api-server/        Express 5 API + Telegraf bots
│   └── strikerx/          React + Vite Mini App + Admin Dashboard
├── lib/
│   ├── api-spec/          OpenAPI spec (source of truth)
│   ├── api-client-react/  Generated React Query hooks
│   ├── api-zod/           Generated Zod schemas (server validation)
│   └── db/                Drizzle ORM schema + client
├── docs/                  Architecture and handoff docs
└── scripts/               Utility scripts including SHELL_SYNC.sh
```

---

## Local Setup

### Prerequisites
- Node.js 24+
- pnpm 10+
- PostgreSQL database (set `DATABASE_URL`)

### Environment Variables

Copy `.env.example` and populate all values:

```bash
cp .env.example .env
```

### Install Dependencies

```bash
pnpm install
```

### Push Database Schema

```bash
pnpm --filter @workspace/db run push
```

### Run Everything (Development)

```bash
# API Server + Bots
pnpm --filter @workspace/api-server run dev

# Mini App + Admin (separate terminal)
pnpm --filter @workspace/strikerx run dev
```

---

## Environment Variable Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✓ | PostgreSQL connection string |
| `GAMEBOT_TOKEN` | ✓ | GameBot Telegram bot token |
| `GROUPBOT_TOKEN` | ✓ | GroupBot Telegram bot token |
| `CRYPTOBOT_TOKEN` | ✓ | CryptoBot API token |
| `TON_WALLET_ADDRESS` | ✓ | TON wallet for withdrawals |
| `USDT_TRC20_ADDRESS` | ✓ | USDT TRC20 address |
| `JWT_SECRET` | ✓ | JWT signing secret |
| `SESSION_SECRET` | ✓ | Session signing secret |
| `ENCRYPTION_KEY` | ✓ | AES encryption key |
| `ADMIN_USERNAME` | ✓ | Admin dashboard username |
| `ADMIN_PASSWORD` | ✓ | Admin dashboard password |
| `MINI_APP_LINK` | ✓ | Telegram Mini App link |
| `GITHUB_TOKEN` | – | GitHub token for sync |
| `NODE_ENV` | – | `development` or `production` |
| `PORT` | – | API server port (default 5000) |
| `WEBHOOK_URL` | – | Public URL for bot webhooks |

### Game Config (set via Replit Configurations)

| Variable | Default | Description |
|----------|---------|-------------|
| `HOUSE_EDGE_SHOT` | 4 | Crash game house edge % |
| `HOUSE_EDGE_PENALTY` | 4 | Penalty game house edge % |
| `HOUSE_EDGE_MINEFIELD` | 4 | Minefield house edge % |
| `HOUSE_EDGE_FREEKICK` | 4 | Free Kick house edge % |
| `STRIKER_DEPOSIT_RATE` | 100 | STRIKER per 1 TON |
| `STRIKER_WITHDRAW_RATE` | 110 | STRIKER per 1 TON out |
| `MIN_DEPOSIT_TON` | 0.5 | Minimum deposit in TON |
| `MIN_WITHDRAW_STRIKER` | 1000 | Minimum withdrawal in STRIKER |
| `JACKPOT_PERCENTAGE` | 1 | % of every bet to jackpot |
| `JACKPOT_MIN_POOL` | 50 | Minimum TON to trigger jackpot |
| `JACKPOT_SEED_AMOUNT` | 10 | TON seed after jackpot triggers |
| `WAGER_REQUIREMENT_MULTIPLIER` | 10 | Bonus wager requirement |
| `REFERRAL_TIER1_PERCENTAGE` | 10 | Tier 1 referral % |
| `REFERRAL_TIER2_PERCENTAGE` | 5 | Tier 2 referral % |
| `BIG_WIN_ANNOUNCE_THRESHOLD` | 50 | STRIKER threshold for group announce |
| `INACTIVE_DAYS_TAG_THRESHOLD` | 3 | Days before reactivation tag |
| `NEW_ACCOUNT_REVIEW_THRESHOLD` | 1 | First N withdrawals held for review |

---

## Deployment

### Replit (Development)
Everything runs via Replit workflows. No config needed.

### Railway
`railway.toml` configures each service independently:
```bash
railway up
```

### Render
`render.yaml` configures the full service mesh:
```bash
# Push to GitHub, Render auto-deploys
```

### Docker
```bash
docker-compose up --build
```

Zero code changes required between platforms. Only environment variables differ.

---

## Key Commands

```bash
# Regenerate API types after spec changes
pnpm --filter @workspace/api-spec run codegen

# Full typecheck
pnpm run typecheck

# Push DB schema (dev only)
pnpm --filter @workspace/db run push

# Sync to GitHub manually
bash scripts/SHELL_SYNC.sh
```
