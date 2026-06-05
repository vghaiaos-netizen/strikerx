import { Router, type IRouter } from "express";
import { getGroupBot } from "../lib/groupBot";
import { getGameBot } from "../lib/gameBot";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// GroupBot webhook endpoint
router.post("/bots/groupbot", async (req, res): Promise<void> => {
  const bot = getGroupBot();
  if (!bot) {
    res.status(503).json({ error: "GroupBot not configured" });
    return;
  }
  try {
    await bot.handleUpdate(req.body);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "GroupBot webhook error");
    res.status(500).json({ error: "Webhook error" });
  }
});

// GameBot webhook endpoint
router.post("/bots/gamebot", async (req, res): Promise<void> => {
  const bot = getGameBot();
  if (!bot) {
    res.status(503).json({ error: "GameBot not configured" });
    return;
  }
  try {
    await bot.handleUpdate(req.body);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "GameBot webhook error");
    res.status(500).json({ error: "Webhook error" });
  }
});

export default router;
