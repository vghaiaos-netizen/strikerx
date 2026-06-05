---
name: StrikerX Dev Auth Bypass
description: How to authenticate against the StrikerX API without a real Telegram Mini App.
---

# Dev Auth Bypass

In `NODE_ENV=development`, the `/api/auth/telegram` endpoint accepts a special initData format:

```
POST /api/auth/telegram
{ "initData": "dev:TELEGRAM_ID:USERNAME" }
```

Example:
```
{ "initData": "dev:123456:testuser" }
```

This bypasses Telegram signature validation and creates/returns a JWT for the given player.

**Why:** Allows testing all API endpoints and the React frontend without needing a real Telegram client.

**How to apply:** Use this when testing game routes, profile endpoints, or admin flows from curl or Postman. Never works in production (NODE_ENV=production).
