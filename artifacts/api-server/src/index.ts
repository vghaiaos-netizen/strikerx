import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { initWebSocketServer } from "./lib/wsServer";
import { startCrashEngine } from "./lib/crashEngine";
import { startScheduler } from "./lib/scheduler";
import { pool } from "@workspace/db";

// ── Production secret validation ─────────────────────────────────────────────
const isProd = process.env.NODE_ENV === "production";

if (isProd) {
  // Hard-required: these have no safe fallback
  const HARD_REQUIRED = [
    "JWT_SECRET", "GAMEBOT_TOKEN", "GROUPBOT_TOKEN",
    "CRYPTOBOT_TOKEN", "ADMIN_USERNAME", "ADMIN_PASSWORD",
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

  // Soft-required: warn but don't crash — functionality is degraded without them
  // At least one of REPLIT_DOMAINS, RAILWAY_PUBLIC_DOMAIN, or WEBHOOK_DOMAIN must be set
  const hasPublicDomain =
    !!process.env.REPLIT_DOMAINS ||
    !!process.env.RAILWAY_PUBLIC_DOMAIN ||
    !!process.env.WEBHOOK_DOMAIN;
  if (!hasPublicDomain) {
    logger.warn(
      "No public domain env var found (REPLIT_DOMAINS / RAILWAY_PUBLIC_DOMAIN / WEBHOOK_DOMAIN). " +
      "Telegram bot webhooks will NOT be registered automatically."
    );
  }
  if (!process.env.TELEGRAM_GROUP_ID) {
    logger.warn("TELEGRAM_GROUP_ID not set — GroupBot broadcasts disabled");
  }

  logger.info(
    {
      platform: process.env.RAILWAY_ENVIRONMENT ? "railway" : process.env.REPLIT_DOMAINS ? "replit" : "other",
      domain: process.env.RAILWAY_PUBLIC_DOMAIN ?? process.env.REPLIT_DOMAINS ?? process.env.WEBHOOK_DOMAIN ?? "(none)",
    },
    "Production startup"
  );
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

  // Idempotent schema migrations — safe to run on every startup.
  // Every column/table added after the initial Railway deploy must appear here
  // so production auto-heals on the next container start without manual DDL.
  const migrations: Array<{ name: string; sql: string }> = [
    {
      name: "players.language_preference",
      sql: `ALTER TABLE players ADD COLUMN IF NOT EXISTS language_preference TEXT NOT NULL DEFAULT 'en'`,
    },
    {
      name: "players.captain_balance",
      sql: `ALTER TABLE players ADD COLUMN IF NOT EXISTS captain_balance REAL NOT NULL DEFAULT 0`,
    },
    {
      name: "players.device_fingerprint",
      sql: `ALTER TABLE players ADD COLUMN IF NOT EXISTS device_fingerprint TEXT`,
    },
    {
      name: "players.affiliate_code",
      sql: `ALTER TABLE players ADD COLUMN IF NOT EXISTS affiliate_code TEXT`,
    },
    {
      name: "players.country",
      sql: `ALTER TABLE players ADD COLUMN IF NOT EXISTS country TEXT`,
    },
    {
      name: "players.group_member_status",
      sql: `ALTER TABLE players ADD COLUMN IF NOT EXISTS group_member_status BOOLEAN NOT NULL DEFAULT FALSE`,
    },
    {
      name: "players.first_withdrawal_reviewed",
      sql: `ALTER TABLE players ADD COLUMN IF NOT EXISTS first_withdrawal_reviewed BOOLEAN NOT NULL DEFAULT FALSE`,
    },
    {
      name: "players.striker_wagered_since_bonus",
      sql: `ALTER TABLE players ADD COLUMN IF NOT EXISTS striker_wagered_since_bonus REAL NOT NULL DEFAULT 0`,
    },
    {
      name: "players.ban_reason",
      sql: `ALTER TABLE players ADD COLUMN IF NOT EXISTS ban_reason TEXT`,
    },
    {
      name: "players.last_streak_claim",
      sql: `ALTER TABLE players ADD COLUMN IF NOT EXISTS last_streak_claim TIMESTAMPTZ`,
    },
    {
      name: "transactions.metadata",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS metadata JSONB`,
    },
    {
      name: "games.affiliate_commission_paid",
      sql: `ALTER TABLE games ADD COLUMN IF NOT EXISTS affiliate_commission_paid BOOLEAN NOT NULL DEFAULT FALSE`,
    },
  ];

  for (const { name, sql } of migrations) {
    try {
      await pool.query(sql);
      logger.info({ column: name }, "Schema migration: column ensured");
    } catch (err) {
      logger.warn({ err, column: name }, "Schema migration warning (non-fatal)");
    }
  }

  // Start crash engine after server is ready
  startCrashEngine().catch((err) => logger.error({ err }, "Crash engine failed to start"));

  // Start scheduler (tournament auto-end, cron jobs)
  startScheduler();
});

server.on("error", (err) => {
  logger.error({ err }, "Server error");
  process.exit(1);
});

// ── Graceful shutdown (Railway sends SIGTERM before stopping the container) ───
function gracefulShutdown(signal: string) {
  logger.info({ signal }, "Shutdown signal received — draining connections");
  server.close(() => {
    logger.info("HTTP server closed cleanly");
    process.exit(0);
  });
  // Force-exit if in-flight requests haven't drained within 15 s
  setTimeout(() => {
    logger.warn("Graceful shutdown timed out — forcing exit");
    process.exit(1);
  }, 15_000).unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT",  () => gracefulShutdown("SIGINT"));
