---
name: CryptoBot webhook registration
description: CryptoPay has no API to set the webhook URL. It must be done manually. The server logs the correct URL on every startup.
---

# CryptoBot Webhook Registration

## The constraint
`https://pay.crypt.bot/api/setWebhook` returns `{"ok":false,"error":{"code":405,"name":"METHOD_NOT_FOUND"}}`.
This endpoint does not exist. CryptoPay provides no API for setting the webhook.

**How to register it (manual, one-time):**
1. Open Telegram → `@CryptoBot` → send `/myapps`
2. Select the StrikerX app
3. Go to **Webhooks**
4. Paste the URL logged on startup: look for the `"CryptoBot webhook URL"` info log

## The webhook endpoint in code
`POST /api/payments/webhook/cryptobot` — defined in `artifacts/api-server/src/routes/payments.ts`

Signature verification: HMAC-SHA256 of the raw request body, using `sha256(CRYPTOBOT_API_TOKEN)` as the key. The raw body is captured in `app.ts` via the `express.json` verify callback into `req.rawBody`.

## What happens without it
Deposit invoices are created (player gets a payment link), but the payment completion event never reaches the server. The player's balance is never credited. The admin must credit manually.
