import express from "express";
import type { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import path from "path";
import { existsSync } from "fs";
import router from "./routes";
import { logger } from "./lib/logger";
import { initGameBot } from "./lib/gameBot";
import { initGroupBotScheduler } from "./lib/groupBot";
import { db, jackpotTable } from "@workspace/db";
import { initConfig } from "./lib/configService";

const app: Express = express();

// Trust reverse proxies (Replit, Railway, etc.) for real IP via X-Forwarded-For
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

// ── CORS ───────────────────────────────────────────────────────────────────────
// Priority: CORS_ORIGIN env → REPLIT_DOMAINS → RAILWAY_PUBLIC_DOMAIN → dev fallback
const isProd = process.env.NODE_ENV === "production";
const corsOrigin = process.env.CORS_ORIGIN;
const replitDomains = process.env.REPLIT_DOMAINS;
const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN;

if (isProd && !corsOrigin && !replitDomains && !railwayDomain) {
  logger.error("No CORS origin configured in production — set CORS_ORIGIN, REPLIT_DOMAINS, or RAILWAY_PUBLIC_DOMAIN.");
  process.exit(1);
}

const allowedOrigins: string[] = corsOrigin
  ? corsOrigin.split(",").map(o => o.trim())
  : [
      ...(replitDomains ? replitDomains.split(",").map(d => `https://${d.trim()}`) : []),
      ...(process.env.REPLIT_DEV_DOMAIN ? [`https://${process.env.REPLIT_DEV_DOMAIN}`] : []),
      ...(railwayDomain ? [`https://${railwayDomain}`] : []),
      ...(!isProd ? ["http://localhost:5000", "http://localhost:3000", "http://localhost:8000"] : []),
    ];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, curl, CryptoBot webhooks)
      if (!origin) return callback(null, true);
      if (allowedOrigins.some(o => origin === o || origin.endsWith(`.${o.replace(/^https?:\/\//, "")}`))) {
        return callback(null, true);
      }
      return callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  }),
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

// ── Static frontend serving (production) ──────────────────────────────────────
// In production the Vite frontend is pre-built; serve it from the same Express process.
// This lets a single port (5000) handle both the API and the Mini App UI.
if (isProd) {
  const distPath = path.resolve("artifacts/strikerx/dist/public");
  if (existsSync(distPath)) {
    app.use(express.static(distPath, { maxAge: "1d", etag: true }));
    // SPA fallback — everything that isn't /api gets index.html
    app.get(/^(?!\/api).*$/, (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    logger.info({ distPath }, "Serving built frontend");
  } else {
    logger.warn({ distPath }, "Frontend dist not found — run the build before deploying");
  }
}

// Global error handler — must have 4 params so Express recognises it as error middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled error");
  const status = (err as Error & { status?: number; statusCode?: number }).status
    ?? (err as Error & { status?: number; statusCode?: number }).statusCode
    ?? 500;
  res.status(status).json({ error: isProd ? "Internal server error" : err.message });
});

// ── Startup: config, jackpot, bots, webhooks ──────────────────────────────────
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

  // Resolve the effective domain: WEBHOOK_DOMAIN > REPLIT_DOMAINS > RAILWAY_PUBLIC_DOMAIN
  const effectiveDomain =
    process.env.WEBHOOK_DOMAIN ??
    replitDomains?.split(",")[0]?.trim() ??
    railwayDomain;

  if (effectiveDomain) {
    // Register Telegram bot webhooks
    const registerTgWebhook = async (token: string, urlPath: string, name: string) => {
      try {
        const r = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: `https://${effectiveDomain}/api${urlPath}`,
            allowed_updates: ["message", "callback_query"],
            drop_pending_updates: true,
          }),
        });
        const d = await r.json() as { ok: boolean; description?: string };
        if (d.ok) logger.info({ name, url: `https://${effectiveDomain}/api${urlPath}` }, "Telegram webhook registered");
        else logger.warn({ name, result: d }, "Telegram webhook registration returned not-ok");
      } catch (err) {
        logger.error({ err, name }, "Failed to register Telegram webhook");
      }
    };

    if (process.env.GAMEBOT_TOKEN) {
      await registerTgWebhook(process.env.GAMEBOT_TOKEN, "/bots/gamebot/webhook", "GameBot");
    }
    // Small delay between webhook registrations to avoid Telegram 429 rate-limit
    await new Promise(r => setTimeout(r, 1500));
    if (process.env.GROUPBOT_TOKEN) {
      await registerTgWebhook(process.env.GROUPBOT_TOKEN, "/bots/groupbot/webhook", "GroupBot");
    }

    // CryptoBot webhook must be registered manually via @CryptoBot in Telegram:
    //   /setwebhook → set URL to: https://<domain>/api/payments/webhook/cryptobot
    // The API does not expose a setWebhook method — only manual setup is supported.
    if (process.env.CRYPTOBOT_API_TOKEN) {
      logger.info(
        { url: `https://${effectiveDomain}/api/payments/webhook/cryptobot` },
        "CryptoBot webhook URL (register manually via @CryptoBot → /setwebhook)",
      );
    }
  } else {
    logger.warn("No WEBHOOK_DOMAIN or REPLIT_DOMAINS set — Telegram and CryptoBot webhooks not registered");
  }
})();

export default app;
