import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { initWebSocketServer } from "./lib/wsServer";
import { startCrashEngine } from "./lib/crashEngine";
import { startScheduler } from "./lib/scheduler";

// ── Production secret validation ─────────────────────────────────────────────
const isProd = process.env.NODE_ENV === "production";

if (isProd) {
  // Hard-required: these have no safe fallback
  const HARD_REQUIRED = [
    "JWT_SECRET", "GAMEBOT_TOKEN", "GROUPBOT_TOKEN",
    "CRYPTOBOT_API_TOKEN", "ADMIN_USERNAME", "ADMIN_PASSWORD",
  ] as const;

  const missing = HARD_REQUIRED.filter(k => !process.env[k]);
  if (missing.length > 0) {
    logger.error({ missing }, "FATAL: Required production secrets are not set. Refusing to start.");
    process.exit(1);
  }

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === "dev-secret-change-in-prod") {
    logger.error("FATAL: JWT_SECRET is missing or is the default dev value. All tokens are forgeable.");
    process.exit(1);
  }

  if (process.env.ADMIN_PASSWORD === "admin123") {
    logger.error("FATAL: ADMIN_PASSWORD is the default 'admin123'. Set a strong password.");
    process.exit(1);
  }

  // Soft-required: warn but don't crash — app still works without them,
  // functionality is just degraded (no broadcasts / no webhooks until set)
  const SOFT_REQUIRED = ["TELEGRAM_GROUP_ID", "WEBHOOK_DOMAIN", "CORS_ORIGIN"] as const;
  const softMissing = SOFT_REQUIRED.filter(k => !process.env[k] && !process.env.REPLIT_DOMAINS);
  if (softMissing.length > 0) {
    logger.warn({ softMissing }, "Some recommended env vars are not set — functionality may be degraded");
  }
}

// ── Global process handlers ───────────────────────────────────────────────────
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception — shutting down");
  process.exit(1);
});

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);

// WebSocket server (crash game)
initWebSocketServer(server);

server.listen(port, async () => {
  logger.info({ port }, "Server listening");

  // Start crash engine after server is ready
  startCrashEngine().catch((err) => logger.error({ err }, "Crash engine failed to start"));

  // Start scheduler (tournament auto-end, cron jobs)
  startScheduler();
});

server.on("error", (err) => {
  logger.error({ err }, "Server error");
  process.exit(1);
});
