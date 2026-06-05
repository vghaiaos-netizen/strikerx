# StrikerX — Agent Rules

Every future agent session MUST follow these rules without exception.

---

## Session Start Checklist

1. **Read `docs/AGENT_HANDOFF.md` first.** Every session. No exceptions. This is the only way to know what is built and what is pending.
2. Run `pnpm run typecheck` to verify the codebase is clean before making changes.
3. Check workflow logs for any runtime errors before starting new features.

---

## Code Rules

1. **No hardcoded values.** Every configurable value uses `process.env`. If it's not in `.env.example`, it doesn't exist.
2. **Never use `console.log` or `console.error` in server code.** Use `req.log` inside route handlers, `logger` singleton elsewhere.
3. **DB schema changes = `pnpm --filter @workspace/db run push`.** Do not run raw SQL migrations directly.
4. **OpenAPI spec is the source of truth.** Add endpoints to `lib/api-spec/openapi.yaml` first, then run codegen, then implement server routes.
5. **Body schemas must use entity-shaped names** (e.g. `PlayerInput`, not `CreatePlayerBody`). See `lib/api-spec/openapi.yaml` naming conventions.
6. **Express 5 wildcard syntax**: Use `/{*splat}`, not `/*` or `*`.

---

## Deployment Rules

1. **All services must be independently deployable** on Replit, Railway, Render, and Docker.
2. **No platform-specific code.** Only environment variables differ between platforms.
3. **After significant code changes, push to GitHub** using `bash scripts/SHELL_SYNC.sh`.

---

## Session End Checklist

1. Update `docs/AGENT_HANDOFF.md` with what was built, what decisions were made, and what is pending.
2. Run `pnpm run typecheck` and fix any errors.
3. Run `bash scripts/SHELL_SYNC.sh` to push to GitHub.
4. Restart affected workflows.

---

## Architecture Rules

1. Both bots (GroupBot, GameBot) run inside the same API server process.
2. JWT secrets must never change after users exist (invalidates all sessions).
3. The 10-STRIKER spread between deposit and withdrawal rates is REVENUE — never equalize them.
4. Jackpot pool must always seed at `JACKPOT_SEED_AMOUNT` TON immediately after triggering.
5. New player first withdrawal always goes to manual review queue regardless of amount.
