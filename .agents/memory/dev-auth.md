---
name: Dev Auth Bypass
description: How to authenticate as a test player in development without a real Telegram init data
---

**Endpoint:** `POST /api/auth/telegram`

**Dev payload:** `{ "initData": "dev:123456:player_dev" }`

Format: `dev:<telegramId>:<username>` — creates/returns a player with the given telegramId and username. On first login, the player receives a 500 STRIKER welcome bonus.

**Wrong format (returns 401):** `"mock_init_data"`, `"dev_mode"`, anything that doesn't match `dev:<id>:<username>`.

**Why:** The server detects the `dev:` prefix and bypasses Telegram HMAC validation. This only works when `NODE_ENV !== "production"` (or equivalent dev mode check in auth middleware).

**How to apply:** Use this in any frontend page or curl test during development. JWT is stored in `localStorage.strikerx_token`.
