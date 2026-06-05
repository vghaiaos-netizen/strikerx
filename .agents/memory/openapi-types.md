---
name: OpenAPI Type Quirks
description: Non-obvious field name mismatches between API schema and what you might guess
---

These are fields where intuitive names differ from what the OpenAPI spec actually defines. Always check `lib/api-spec/openapi.yaml` when in doubt — do NOT guess.

| What you might write | What the schema actually says |
|---|---|
| `referral.referralCode` | `referral.code` |
| `streak.currentStreak` | `streak.streakDays` |
| `streak.canClaimToday` | `streak.canClaim` |
| `res.payUrl` (deposit invoice) | `res.payLink` |
| `walletAddress` (withdrawal input) | `destinationAddress` |
| `currency: "ton"` (lowercase) | `currency: "TON"` (uppercase; full enum: TON, USDT_TON, USDT_TRC20, BNB, SOL) |
| `claimStreak.mutateAsync({})` | `claimStreak.mutateAsync()` — takes void, no arg |
| `(me as Record<string,unknown>)?.strikerBalance` | `me?.strikerBalance` — Player is typed directly |

**Why:** The generated types from Orval/openapi.yaml are the source of truth. Editor autocomplete can suggest old/guessed names that don't match.

**How to apply:** When writing a page that uses these fields, cross-check the generated file `lib/api-client-react/src/generated/api.ts` rather than guessing field names.
