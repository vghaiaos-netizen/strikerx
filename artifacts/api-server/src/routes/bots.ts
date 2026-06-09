import { Router, type IRouter } from "express";
import { createHash } from "crypto";
import { getGroupBot } from "../lib/groupBot";
import { getGameBot } from "../lib/gameBot";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * Derives a Telegram webhook secret token from the bot token.
 * The result is a 64-char hex string — always valid per Telegram's secret_token spec.
 * Must match the secret_token passed to setWebhook in app.ts.
 */
export function deriveWebhookSecret(botToken: string): string {
  return createHash("sha256").update(`tg-webhook:${botToken}`).digest("hex");
}

function verifyTelegramSecret(req: Parameters<typeof router.post>[1] extends (req: infer R, ...args: unknown[]) => unknown ? R : never, botToken: string): boolean {
  const incoming = req.headers["x-telegram-bot-api-secret-token"];
  if (!incoming || typeof incoming !== "string") return false;
  return incoming === deriveWebhookSecret(botToken);
}

// GroupBot webhook endpoint
router.post("/bots/groupbot/webhook", async (req, res): Promise<void> => {
  const token = process.env.GROUPBOT_TOKEN;
  if (!token) {
    res.status(503).json({ error: "GroupBot not configured" });
    return;
  }
  if (!verifyTelegramSecret(req, token)) {
    logger.warn({ ip: req.ip }, "GroupBot webhook: invalid secret token");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const bot = getGroupBot();
  if (!bot) {
    res.status(503).json({ error: "GroupBot not initialized" });
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
router.post("/bots/gamebot/webhook", async (req, res): Promise<void> => {
  const token = process.env.GAMEBOT_TOKEN;
  if (!token) {
    res.status(503).json({ error: "GameBot not configured" });
    return;
  }
  if (!verifyTelegramSecret(req, token)) {
    logger.warn({ ip: req.ip }, "GameBot webhook: invalid secret token");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const bot = getGameBot();
  if (!bot) {
    res.status(503).json({ error: "GameBot not initialized" });
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
