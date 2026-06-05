import { Router, type IRouter } from "express";
import { getConfig } from "../lib/configService";

const router: IRouter = Router();

// GET /rate-events/active — public, no auth required
// Returns the currently active rate event or { active: false }
router.get("/rate-events/active", async (_req, res): Promise<void> => {
  const active      = await getConfig("rate_event_active").catch(() => "false");
  const depositRate = await getConfig("rate_event_deposit_rate").catch(() => "100");
  const endsAt      = await getConfig("rate_event_ends_at").catch(() => "");
  const baseRate    = await getConfig("striker_deposit_rate").catch(() => "100");

  if (active !== "true") {
    res.json({ active: false });
    return;
  }

  // Auto-expire: if endsAt is in the past, treat as inactive
  if (endsAt && new Date(endsAt).getTime() < Date.now()) {
    res.json({ active: false });
    return;
  }

  res.json({
    active: true,
    depositRate: parseFloat(depositRate),
    endsAt: endsAt || null,
    baseRate: parseFloat(baseRate),
  });
});

export default router;
