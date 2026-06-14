# StrikerX — Agent Rules

Every future agent session MUST follow these rules without exception.

---

## Session Start Checklist

1. **Read `docs/AGENT_HANDOFF.md` first.** Every session. No exceptions. This is the only way to know what is built and what is pending.
2. **Read `docs/for-replit-agents.md`** for full dev environment details, secrets, and gotchas.
3. Check workflow logs for any runtime errors before starting new features.
4. Run `pnpm run typecheck` to verify the codebase is clean before making changes.

---

## Code Rules

1. **No `console.log` or `console.error` in server code.** Use `req.log` inside Express route handlers, `logger` singleton (from `lib/logger.ts`) everywhere else.
2. **No hardcoded config values.** Every configurable value lives in `app_config` table (read via `configService.getConfig(key)`) or `process.env`.
3. **DB schema changes require two steps:**
   - Dev: edit `lib/db/src/schema/*.ts` then run `pnpm --filter @workspace/db run push`
   - Production (Railway): add an `IF NOT EXISTS` entry to the `migrations` array in `artifacts/api-server/src/index.ts` — runs safely on every startup
   - **Never run `drizzle-kit push` against Railway** — it will fail without a TTY and could corrupt data
4. **OpenAPI spec is the source of truth.** Add endpoints to `lib/api-spec/openapi.yaml` first, then run `pnpm --filter @workspace/api-spec run codegen`, then implement server routes.
5. **Never edit generated files** — `lib/api-client-react/src/generated/api.ts` and `lib/api-zod/src/generated/api.ts` are auto-generated. Run codegen instead.
6. **Express 5 wildcard syntax**: Use `/{*splat}`, not `/*` or `*`.
7. **Drizzle numeric columns return as strings** — always wrap with `parseFloat(String(value))` or `Number(value)`.
8. **`match_event_active` is never `null`** — `getConfig()` returns `""` when unset. Always compare `=== "true"`, never truthy.

---

## Deployment Rules

1. **`git push` is blocked in Replit.** The only working push is `node scripts/github-push.mjs` from a bash shell (NOT from the code_execution sandbox — PAT is not available there).
2. **Lockfile discipline:** Any time any `package.json` changes, run `pnpm install` to regenerate `pnpm-lock.yaml`, then push. Never push dep changes without the lockfile — Railway runs `--frozen-lockfile`.
3. **After significant code changes, push to GitHub:** `node scripts/github-push.mjs`
4. **All services must work on Replit and Railway** — no platform-specific code. Only env vars differ.
5. **Never call `setWebhook` from Replit dev** — Railway owns the Telegram webhooks, self-heals on every deploy.

---

## Session End Checklist

1. Update `docs/AGENT_HANDOFF.md` with what was built, what decisions were made, and what is pending.
2. Run `pnpm run typecheck` and fix any errors.
3. Run `node scripts/github-push.mjs` from a bash shell to push to GitHub → Railway auto-deploys.
4. Restart affected workflows if server code changed.

---

## Architecture Rules

1. **Trading is the primary product** — `/` loads the trading terminal. Do not change the navigation structure without explicit instruction.
2. **Both bots run inside the same API server process** — do not split them.
3. **JWT secret must never change after users exist** — invalidates all sessions.
4. **The 10-STRIKER spread is REVENUE** — deposit rate 100/TON, withdraw rate 110/TON. Never equalize.
5. **Jackpot pool must always re-seed** at `jackpot_seed_amount` TON immediately after triggering.
6. **First withdrawal always goes to `under_review`** for manual admin review, regardless of amount.
7. **Webhook registration is centralised in `app.ts` IIFE only** — never add `setWebhook` to `gameBot.ts` or `groupBot.ts`.
8. **Referral links always use `MINI_APP_LINK` env var** (`t.me/StrykkerXBot/StrikerX`) — never the HTTP server domain.
9. **CryptoBot secret key is `CRYPTOBOT_TOKEN`** — NOT `CRYPTOBOT_API_TOKEN`.
