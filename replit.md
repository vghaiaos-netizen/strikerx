# StrikerX

A football-themed Telegram Mini App casino platform with four original games, three-tier virtual token economy (STRIKER / BOOT / CAPTAIN), multi-currency crypto payments via CryptoBot, dual Telegram bot architecture, and a private admin dashboard. Stake.com meets Hamster Kombat — living entirely inside Telegram.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/strikerx run dev` — run the React Mini App frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite + TailwindCSS + shadcn/ui
- Bots: Telegraf v4 (GameBot + GroupBot)
- Payments: CryptoBot API

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for all endpoints)
- `lib/api-client-react/src/generated/api.ts` — Generated React Query hooks
- `lib/api-zod/src/generated/api.ts` — Generated Zod schemas (server validation)
- `lib/db/src/schema/` — Drizzle ORM schema files
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/lib/` — auth, gameEngine, groupBot, gameBot
- `artifacts/strikerx/src/` — React frontend (Mini App + Admin Dashboard)
- `docs/AGENT_HANDOFF.md` — Session handoff document (read first every session)
- `docs/ARCHITECTURE.md` — System architecture overview
- `docs/ROADMAP.md` — Feature roadmap

## Architecture decisions

- Both Telegraf bots (GroupBot + GameBot) run inside the same Express process
- JWT for Mini App auth — Telegram init data validated server-side, JWT issued
- All game outcomes determined server-side with provably-fair seeded RNG
- 10-STRIKER spread between deposit (100/TON) and withdraw (110/TON) rates is deliberate revenue
- Jackpot seeded at JACKPOT_SEED_AMOUNT after each trigger; house keeps 10% of each trigger
- New player first withdrawal always goes to manual review queue
- In dev mode, initData can be bypassed with `dev:telegramId:username` format

## Product

- **The Shot** — Crash game, multiplier rises until it crashes, players cash out before crash
- **Penalty** — Pick left/center/right, keeper guesses — 1.92x payout on win
- **Minefield** — Click safe squares on a configurable grid, compound multiplier, cash out anytime
- **Free Kick** — Plinko-style ball drop with three risk levels (low/medium/high)
- **Golden Boot** — Shared jackpot pool seeded 1% from all bets, triggers probabilistically
- **VIP Tiers** — Sunday League → Championship → Premier League → Champions League → World Cup
- **Daily Streak** — Escalating rewards on days 3, 7, 14, 21, 30
- **2-Tier Referrals** — 10% tier 1, 5% tier 2 on all bets (lifetime)

## User preferences

- No emojis in UI — use lucide-react icons instead
- Dark mode first
- Football stadium aesthetic: deep navy/black, vibrant green, gold accents

## Gotchas

- After schema changes, always run `pnpm --filter @workspace/db run push`
- After OpenAPI spec changes, always run `pnpm --filter @workspace/api-spec run codegen`
- Never use `console.log` in server code — use `req.log` in routes, `logger` elsewhere
- Bots only activate when GAMEBOT_TOKEN / GROUPBOT_TOKEN env vars are set
- In dev mode auth bypass: `initData: "dev:123456:myusername"` in POST /auth/telegram

## Pointers

- See `docs/AGENT_HANDOFF.md` for full session handoff
- See `docs/ARCHITECTURE.md` for system diagram
- See `docs/ROADMAP.md` for what's next
- See the `pnpm-workspace` skill for workspace structure
