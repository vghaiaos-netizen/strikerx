# Phase 9 — UI Hype & Retention Overhaul

## Why this exists
The backend is feature-complete (~90%). The next growth lever is pure experience:
making players feel the hype, social proof, and loyalty rewards at every touchpoint.

---

## Changes shipped in this phase

### 1. Live Winners Section (Home page)
**Before:** A single rotating text ticker showing one win at a time.
**After:** A stacked, animated list of recent real wins pulled from the DB
(`GET /api/public/recent-wins`) merged with live WebSocket `big_win` events.
New wins slide in at the top in real time. Shows winner, game, amount, multiplier, time ago.

### 2. Referral CTA on Home
A compact "Earn with your Squad" card on the home page — shows the player's
referral code, a one-tap copy button, and a link to the full Loyalty Hub.
Drives top-of-funnel referral awareness every session.

### 3. New /loyalty page — The Loyalty Hub
Replaces the buried referral/streak/cashback sections in Profile.
Accessible via the bottom nav (replaces "Badges").

Sections:
- **VIP Status** — tier name, progress to next tier, perks per tier
- **Daily Streak** — 7-day dot calendar, animated CLAIM button
- **Refer & Earn** — large referral code block, COPY + SHARE TO TELEGRAM buttons,
  squad list with per-friend earnings breakdown, Tier 1/2 totals
- **Weekly Cashback** — rate, estimated amount, claim button
- **Achievements** — unlocked badge grid, link to full /achievements page
- **Boot Shop** — BOOT → STRIKER conversion (only shown if balance > 0)

### 4. Profile page simplification
Profile is now account management only:
- Avatar + VIP badge
- Loyalty Hub quick-link card (green border, prominent)
- Token balances
- Boot Shop (if applicable)
- Game stats
- KYC verification

### 5. Global Jackpot Win Overlay
A full-screen animated overlay that fires whenever a `jackpot_won`
WebSocket event arrives — for ALL players on the platform simultaneously.
Shows winner, amount, animated gold burst, auto-dismisses after 8 seconds.
Tapping anywhere dismisses.

### 6. Achievement Unlock Toast
When a player's own achievement fires (`achievement_unlocked` WS event),
a slide-up card appears from the bottom of the screen with the achievement
rarity color, title, and description. Auto-dismisses after 4 seconds.

### 7. Backend: `/api/public/recent-wins`
New public (no auth) endpoint that returns the last 20 wins above 100 STRIKER
from the games table. Joined with player usernames. Used by home page.

### 8. Nav update
Old: Home | Rank | Wallet | Profile | Badges
New: Home | Rank | Wallet | **Loyalty** | Profile

Achievements are accessible from the Loyalty Hub ("View all badges" link).

---

## How frontend changes appear

| Change type | How to see it |
|---|---|
| React/Vite frontend (.tsx files) | **Instant** — Vite hot-reloads in under 1 second. No action needed. |
| Server routes (.ts in api-server) | Requires API Server rebuild. The workflow does this on start, so restart it or run the build command. |
| DB schema changes | Run `pnpm --filter @workspace/db run push` (dev only) |

---

## GitHub sync workflow

```bash
# After every working session — keeps replit branch in sync (safe, no Railway deploy)
node scripts/github-push.mjs

# When you are READY to go live on Railway (~3 min deploy)
node scripts/promote.mjs
```

### How to promote to production — step by step

1. Open a **Shell** tab in Replit (not the console, the actual terminal)
2. Run `node scripts/promote.mjs`
3. You will see: `Merge successful — SHA: xxxxxxxx`
4. Open https://railway.app/dashboard
5. Click your StrikerX service → **Deployments** tab
6. Watch the new deployment appear and turn green (takes ~3 min)
7. Done — Railway is live with the latest code from `replit` branch

**Never run `promote.mjs` unless you've tested the changes in dev first.**
After promoting, run `node scripts/github-push.mjs` again immediately
to ensure `replit` stays at the same point as `main`.

---

## Phase 10 ideas (next)
- World Cup prediction mini-game (pick match winner → bonus payout)
- Player vs Player challenge mode (two players bet same amount, winner takes 90%)
- Animated onboarding flow for new users (3-step swipeable intro)
- Leaderboard with live position changes via WebSocket
- Push notifications via Telegram for streak break reminders
