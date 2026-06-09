---
name: viewEnvVars blind spot
description: viewEnvVars() in code_execution does not show user-set secrets. Verify secret presence via server logs instead.
---

# viewEnvVars() Blind Spot

## The behaviour
`viewEnvVars({ type: "all" })` in the code_execution sandbox only surfaces Replit-managed runtime secrets:
`DATABASE_URL`, `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `REPL_ID`, `REPLIT_DOMAINS`, `REPLIT_DEV_DOMAIN`, `SESSION_SECRET`, `GITHUB_PERSONAL_ACCESS_TOKEN`

It does NOT list user-added secrets such as `JWT_SECRET`, `GAMEBOT_TOKEN`, `GROUPBOT_TOKEN`, `CRYPTOBOT_API_TOKEN`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`.

## Why this matters
An agent that runs `viewEnvVars` and sees those secrets absent will incorrectly conclude they need to be set, and may request them from the user again or panic about missing config.

## How to verify secrets are actually present
Check API server startup logs:
- `"GameBot webhook registered"` → `GAMEBOT_TOKEN` is set and valid
- `"GroupBot webhook registered"` or `"GroupBot scheduler initialized"` → `GROUPBOT_TOKEN` set
- `"Server listening"` with no fatal crash → `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` are present
- `curl pay.crypt.bot/api/getMe -H "Crypto-Pay-API-Token: $CRYPTOBOT_API_TOKEN"` → returns app name

## How to actually set a user secret (if needed in future)
Use `requestEnvVar({ requestType: "secret", keys: ["SECRET_NAME"] })` — this prompts the user through the Replit secrets UI. Never use `setEnvVars` for secrets.
