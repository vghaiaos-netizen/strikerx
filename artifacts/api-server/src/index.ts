import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { initWebSocketServer } from "./lib/wsServer";
import { startCrashEngine } from "./lib/crashEngine";
import { startScheduler } from "./lib/scheduler";

// ── Production secret validation ─────────────────────────────────────────────
const isProd = process.env.NODE_ENV === "production";

const REQUIRED_IN_PROD = [
  "JWT_SECRET", "GAMEBOT_TOKEN", "GROUPBOT_TOKEN",
  "TELEGRAM_GROUP_ID", "CRYPTOBOT_API_TOKEN",
  "WEBHOOK_DOMAIN", "CORS_ORIGIN",
  "ADMIN_USERNAME", "ADMIN_PASSWORD",
] as const;

if (isProd) {
  const missing = REQUIRED_IN_PROD.filter(k => !process.env[k]);
  if (missing.length > 0) {
    // Log but don't crash — operator can still set them via env without a code change
    logger.warn({ missing }, "Production env vars not set — set these before going live");
  }
  if (process.env.JWT_SECRET === "dev-secret-change-in-prod") {
    logger.error("CRITICAL: JWT_SECRET is the default dev value. All tokens are forgeable. Set a real secret.");
  }
  if (process.env.ADMIN_PASSWORD === "admin123" || !process.env.ADMIN_PASSWORD) {
    logger.warn("ADMIN_PASSWORD is weak or unset. Change it before going live.");
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
