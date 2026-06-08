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
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(cors());

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

// Initialize config, bots and jackpot in background
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

  Promise.all([
    initGameBot().catch((err) => logger.error({ err }, "GameBot init failed")),
    initGroupBotScheduler().catch((err) => logger.error({ err }, "GroupBot init failed")),
  ]);
})();

export default app;
