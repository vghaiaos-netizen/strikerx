import express from "express";
import type { Express, Request, Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import router from "./routes";
import { logger } from "./lib/logger";
import { initGameBot } from "./lib/gameBot";
import { initGroupBotScheduler } from "./lib/groupBot";
import { db, jackpotTable } from "@workspace/db";
import { initConfig } from "./lib/configService";

const app: Express = express();

// Trust the Replit reverse proxy so rate-limit can read real IPs from X-Forwarded-For
app.set("trust proxy", 1);

// Security headers
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

// Rate limiters
const globalLimiter = rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60_000, max: 30, standardHeaders: true, legacyHeaders: false });
const paymentLimiter = rateLimit({ windowMs: 15 * 60_000, max: 15, standardHeaders: true, legacyHeaders: false });
const gameLimiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });

app.use(globalLimiter);
app.use("/api/auth", authLimiter);
app.use("/api/payments", paymentLimiter);
app.use("/api/games", gameLimiter);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) { return { id: req.id, method: req.method, url: req.url?.split("?")[0] }; },
      res(res) { return { statusCode: res.statusCode }; },
    },
  }),
);

// CORS — allow configured origins; defaults to all in dev, locked to domain in prod
const corsOrigin = process.env.CORS_ORIGIN;
app.use(
  cors(
    corsOrigin
      ? { origin: corsOrigin.split(",").map(o => o.trim()), credentials: true }
      : { origin: true, credentials: true },
  ),
);

// Capture raw body for CryptoBot webhook HMAC verification
app.use(
  express.json({
    verify: (req: Request, _res: Response, buf: Buffer) => {
      (req as Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Initialize config, bots, jackpot, and auto-register webhooks
(async () => {
  await initConfig().catch((err) => logger.error({ err }, "Config service init failed"));

  try {
    const existing = await db.select().from(jackpotTable).limit(1);
    if (existing.length === 0) {
      const seedAmount = parseFloat(process.env.JACKPOT_SEED_AMOUNT ?? "10");
      await db.insert(jackpotTable).values({ currentAmountTon: seedAmount, status: "building" });
      logger.info("Jackpot initialized");
    }
  } catch (err) {
    logger.error({ err }, "Failed to initialize jackpot");
  }

  await Promise.all([
    initGameBot().catch((err) => logger.error({ err }, "GameBot init failed")),
    initGroupBotScheduler().catch((err) => logger.error({ err }, "GroupBot init failed")),
  ]);

  // Auto-register Telegram webhooks when WEBHOOK_DOMAIN env var is set
  const webhookDomain = process.env.WEBHOOK_DOMAIN;
  if (webhookDomain) {
    const registerWebhook = async (token: string, path: string, name: string) => {
      try {
        const r = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: `https://${webhookDomain}/api${path}`,
            allowed_updates: ["message", "callback_query"],
          }),
        });
        const d = await r.json() as { ok: boolean };
        if (d.ok) logger.info({ name, url: `https://${webhookDomain}/api${path}` }, "Webhook registered");
        else logger.warn({ name, result: d }, "Webhook registration returned not-ok");
      } catch (err) {
        logger.error({ err, name }, "Failed to register webhook");
      }
    };

    if (process.env.GAMEBOT_TOKEN) {
      await registerWebhook(process.env.GAMEBOT_TOKEN, "/bots/gamebot/webhook", "GameBot");
    }
    if (process.env.GROUPBOT_TOKEN) {
      await registerWebhook(process.env.GROUPBOT_TOKEN, "/bots/groupbot/webhook", "GroupBot");
    }
  }
})();

export default app;
