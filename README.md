# StrikerX

Football-themed Telegram Mini App casino. Stack: Node.js/Express, PostgreSQL/Drizzle ORM, React/Vite/TailwindCSS, Telegraf bots, CryptoBot payments, WebSocket crash game.

## Setup
```bash
pnpm install
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/strikerx run dev
```

See `docs/AGENT_HANDOFF.md` for full setup guide.
