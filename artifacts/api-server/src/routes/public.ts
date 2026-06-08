import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// GET /public/rate-event — public rate event status (no auth required)
router.get("/public/rate-event", async (_req, res): Promise<void> => {
  try {
    const { getConfig } = await import("../lib/configService");
    const active = await getConfig("rate_event_active").catch(() => "false");
    const depositRate = await getConfig("rate_event_deposit_rate").catch(() => "100");
    const endsAt = await getConfig("rate_event_ends_at").catch(() => "");
    const now = Date.now();
    const isExpired = endsAt ? new Date(endsAt).getTime() < now : false;

    res.json({
      active: active === "true" && !isExpired,
      depositRate: parseFloat(depositRate) || 100,
      endsAt: endsAt || null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to get rate event status");
    res.json({ active: false, depositRate: 100, endsAt: null });
  }
});

// GET /public/match-event — active World Cup / match event
router.get("/public/match-event", async (_req, res): Promise<void> => {
  try {
    const { getConfig } = await import("../lib/configService");
    const active = await getConfig("match_event_active").catch(() => "false");
    const teamA = await getConfig("match_event_team_a").catch(() => "");
    const teamB = await getConfig("match_event_team_b").catch(() => "");
    const bonusMultiplier = await getConfig("match_event_bonus_multiplier").catch(() => "1.0");
    const endsAt = await getConfig("match_event_ends_at").catch(() => "");
    const label = await getConfig("match_event_label").catch(() => "Match Day");
    const now = Date.now();
    const isExpired = endsAt ? new Date(endsAt).getTime() < now : false;

    res.json({
      active: active === "true" && !isExpired,
      teamA: teamA || "",
      teamB: teamB || "",
      bonusMultiplier: parseFloat(bonusMultiplier) || 1.0,
      endsAt: endsAt || null,
      label: label || "",
    });
  } catch (err) {
    logger.error({ err }, "Failed to get match event status");
    res.json({ active: false, teamA: "", teamB: "", bonusMultiplier: 1.0, endsAt: null, label: "" });
  }
});

export default router;
