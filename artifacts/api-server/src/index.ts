import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { initWebSocketServer, broadcastToAll } from "./lib/wsServer";
import { startCrashEngine } from "./lib/crashEngine";
import { startScheduler } from "./lib/scheduler";
import { initBinanceFeed, setExternalPrice } from "./lib/binanceFeed";
import { initForexFeed } from "./lib/forexFeed";
import { startTradingSettlementScheduler } from "./lib/tradingEngine";
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
    // ── Trading tables (binary prediction feature) ───────────────────────────
    {
      name: "trading_assets.create",
      sql: `CREATE TABLE IF NOT EXISTS trading_assets (
        id               SERIAL PRIMARY KEY,
        symbol           TEXT NOT NULL UNIQUE,
        display_name     TEXT NOT NULL,
        binance_symbol   TEXT NOT NULL,
        enabled          BOOLEAN NOT NULL DEFAULT true,
        payout_ratio     REAL NOT NULL DEFAULT 1.82,
        min_stake_striker REAL NOT NULL DEFAULT 10,
        max_stake_striker REAL NOT NULL DEFAULT 10000,
        sort_order       INTEGER NOT NULL DEFAULT 0,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
    },
    {
      name: "trading_assets.seed",
      sql: `INSERT INTO trading_assets (symbol, display_name, binance_symbol, enabled, payout_ratio, min_stake_striker, max_stake_striker, sort_order) VALUES
        ('BTC', 'Bitcoin',  'BTCUSDT', true, 1.82, 10, 10000, 1),
        ('ETH', 'Ethereum', 'ETHUSDT', true, 1.82, 10, 10000, 2),
        ('SOL', 'Solana',   'SOLUSDT', true, 1.82, 10, 10000, 3),
        ('BNB', 'BNB',      'BNBUSDT', true, 1.82, 10, 10000, 4),
        ('TON', 'Toncoin',  'TONUSDT', true, 1.82, 10, 10000, 5)
        ON CONFLICT (symbol) DO NOTHING`,
    },
    {
      name: "trading_positions.create",
      sql: `CREATE TABLE IF NOT EXISTS trading_positions (
        id                    SERIAL PRIMARY KEY,
        player_id             INTEGER NOT NULL,
        asset_symbol          TEXT NOT NULL,
        direction             TEXT NOT NULL,
        stake_striker         REAL NOT NULL,
        entry_price           REAL NOT NULL,
        exit_price            REAL,
        payout_ratio          REAL NOT NULL,
        win_amount            REAL NOT NULL DEFAULT 0,
        outcome               TEXT NOT NULL DEFAULT 'pending',
        contract_duration_secs INTEGER NOT NULL,
        expires_at            TIMESTAMPTZ NOT NULL,
        settled_at            TIMESTAMPTZ,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
    },
    {
      name: "trading_positions.indexes",
      sql: `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'trading_positions_player_id_idx') THEN
          CREATE INDEX trading_positions_player_id_idx ON trading_positions (player_id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'trading_positions_outcome_idx') THEN
          CREATE INDEX trading_positions_outcome_idx ON trading_positions (outcome);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'trading_positions_expires_at_idx') THEN
          CREATE INDEX trading_positions_expires_at_idx ON trading_positions (expires_at);
        END IF;
      END $$`,
    },
    {
      name: "players.trading_win_streak",
      sql: `ALTER TABLE players ADD COLUMN IF NOT EXISTS trading_win_streak INTEGER NOT NULL DEFAULT 0`,
    },
    {
      name: "trading_assets.forex_commodity_seed",
      sql: `INSERT INTO trading_assets (symbol, display_name, binance_symbol, enabled, payout_ratio, min_stake_striker, max_stake_striker, sort_order) VALUES
        ('EURUSD', 'EUR/USD',     'EURUSD=X', true, 1.82, 10, 10000,  6),
        ('GBPUSD', 'GBP/USD',     'GBPUSD=X', true, 1.82, 10, 10000,  7),
        ('USDJPY', 'USD/JPY',     'USDJPY=X', true, 1.82, 10, 10000,  8),
        ('AUDUSD', 'AUD/USD',     'AUDUSD=X', true, 1.82, 10, 10000,  9),
        ('USDCHF', 'USD/CHF',     'USDCHF=X', true, 1.82, 10, 10000, 10),
        ('XAUUSD', 'Gold',        'GC=F',     true, 1.82, 10, 10000, 11),
        ('XAGUSD', 'Silver',      'SI=F',     true, 1.82, 10, 10000, 12),
        ('USOIL',  'Crude Oil',   'CL=F',     true, 1.82, 10, 10000, 13),
        ('NATGAS', 'Natural Gas', 'NG=F',     true, 1.82, 10, 10000, 14),
        ('COPPER', 'Copper',      'HG=F',     true, 1.82, 10, 10000, 15)
        ON CONFLICT (symbol) DO NOTHING`,
    },
    {
      name: "app_config.trading_keys",
      sql: `INSERT INTO app_config (key, value, category, label, description) VALUES
        ('trading_enabled',              'true',       'trading', 'Trading Enabled',              'Enable/disable binary trading'),
        ('trading_default_duration',     '60',         'trading', 'Default Duration (s)',          'Default contract duration in seconds'),
        ('trading_available_durations',  '30,60,300,900', 'trading', 'Available Durations',       'Comma-separated durations in seconds'),
        ('trading_global_payout_ratio',  '1.82',       'trading', 'Global Payout Ratio',          'Win multiplier applied globally'),
        ('trading_min_stake',            '10',         'trading', 'Min Stake (STRIKER)',           'Minimum trade stake'),
        ('trading_max_stake',            '10000',      'trading', 'Max Stake (STRIKER)',           'Maximum trade stake'),
        ('trading_big_win_threshold',    '1000',       'trading', 'Big Win Threshold (STRIKER)',   'Min STRIKER win to announce to group')
        ON CONFLICT (key) DO NOTHING`,
    },
    {
      name: "players.ton_balance",
      sql: `ALTER TABLE players ADD COLUMN IF NOT EXISTS ton_balance REAL NOT NULL DEFAULT 0`,
    },
    {
      name: "players.usdt_balance",
      sql: `ALTER TABLE players ADD COLUMN IF NOT EXISTS usdt_balance REAL NOT NULL DEFAULT 0`,
    },
    {
      name: "trading_positions.contract_type",
      sql: `ALTER TABLE trading_positions ADD COLUMN IF NOT EXISTS contract_type TEXT NOT NULL DEFAULT 'UP_DOWN'`,
    },
    {
      name: "trading_positions.barriers",
      sql: `ALTER TABLE trading_positions
              ADD COLUMN IF NOT EXISTS lower_barrier REAL,
              ADD COLUMN IF NOT EXISTS upper_barrier REAL`,
    },
    {
      name: "trading_positions.currency",
      sql: `ALTER TABLE trading_positions ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'TON'`,
    },
    {
      name: "trading_assets.ton_stakes",
      sql: `ALTER TABLE trading_assets
              ADD COLUMN IF NOT EXISTS min_stake_ton REAL NOT NULL DEFAULT 0.1,
              ADD COLUMN IF NOT EXISTS max_stake_ton REAL NOT NULL DEFAULT 500`,
    },
    {
      name: "app_config.trading_ton_keys",
      sql: `INSERT INTO app_config (key, value, category, label, description) VALUES
        ('trading_min_stake_ton',  '0.1',  'trading', 'Min Stake (TON)',  'Minimum TON trade stake'),
        ('trading_max_stake_ton',  '500',  'trading', 'Max Stake (TON)',  'Maximum TON trade stake'),
        ('trading_inout_spread',   '0.5',  'trading', 'IN/OUT Spread %', 'Band width each side of entry price for IN/OUT contracts')
        ON CONFLICT (key) DO NOTHING`,
    },
    // ── Demo trading ─────────────────────────────────────────────────────────
    {
      name: "players.demo_usdt_balance",
      sql: `ALTER TABLE players ADD COLUMN IF NOT EXISTS demo_usdt_balance REAL NOT NULL DEFAULT 10000`,
    },
    {
      name: "players.demo_last_reset",
      sql: `ALTER TABLE players ADD COLUMN IF NOT EXISTS demo_last_reset TIMESTAMPTZ`,
    },
    {
      name: "demo_positions.create",
      sql: `CREATE TABLE IF NOT EXISTS demo_positions (
        id                     SERIAL PRIMARY KEY,
        player_id              INTEGER NOT NULL REFERENCES players(id),
        asset_symbol           TEXT NOT NULL,
        direction              TEXT NOT NULL,
        contract_type          TEXT NOT NULL DEFAULT 'UP_DOWN',
        stake                  REAL NOT NULL,
        entry_price            REAL NOT NULL,
        exit_price             REAL,
        payout_ratio           REAL NOT NULL DEFAULT 1.82,
        outcome                TEXT NOT NULL DEFAULT 'pending',
        win_amount             REAL NOT NULL DEFAULT 0,
        contract_duration_secs INTEGER NOT NULL DEFAULT 60,
        expires_at             TIMESTAMPTZ NOT NULL,
        settled_at             TIMESTAMPTZ,
        created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
    },
    {
      name: "demo_positions.player_idx",
      sql: `CREATE INDEX IF NOT EXISTS demo_positions_player_id_idx ON demo_positions (player_id)`,
    },
    {
      name: "demo_positions.expires_at_idx",
      sql: `CREATE INDEX IF NOT EXISTS demo_positions_expires_at_idx ON demo_positions (expires_at)`,
    },
    {
      name: "demo_positions.barriers",
      sql: `ALTER TABLE demo_positions
              ADD COLUMN IF NOT EXISTS lower_barrier REAL,
              ADD COLUMN IF NOT EXISTS upper_barrier REAL`,
    },
    {
      name: "manual_deposits.create",
      sql: `CREATE TABLE IF NOT EXISTS manual_deposits (
        id              SERIAL PRIMARY KEY,
        player_id       INTEGER NOT NULL,
        method          TEXT NOT NULL DEFAULT 'mpesa',
        phone_number    TEXT,
        amount_kes      REAL,
        reference       TEXT NOT NULL,
        note            TEXT,
        status          TEXT NOT NULL DEFAULT 'pending',
        amount_striker  REAL DEFAULT 0,
        confirmed_by    TEXT,
        confirmed_at    TIMESTAMPTZ,
        reject_reason   TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
    },
    {
      name: "manual_deposits.indexes",
      sql: `CREATE INDEX IF NOT EXISTS manual_deposits_player_id_idx ON manual_deposits(player_id);
            CREATE INDEX IF NOT EXISTS manual_deposits_status_idx ON manual_deposits(status)`,
    },
    {
      name: "transactions.provider",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS provider TEXT`,
    },
    {
      name: "withdrawals.phone_number",
      sql: `ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS phone_number TEXT`,
    },
    {
      name: "withdrawals.provider",
      sql: `ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'crypto'`,
    },
    // ── Outreach service tables ───────────────────────────────────────────────
    // These three tables support the admin outreach panel and the standalone
    // outreach-service (Railway `outreach` branch).
    // They were created manually on Railway on 2026-06-23; the migrations here
    // ensure any new environment (dev, staging, fork) gets them automatically.
    {
      name: "outreach_groups.create",
      sql: `CREATE TABLE IF NOT EXISTS outreach_groups (
        id             SERIAL PRIMARY KEY,
        telegram_id    TEXT NOT NULL UNIQUE,
        username       TEXT,
        title          TEXT NOT NULL,
        member_count   INTEGER NOT NULL DEFAULT 0,
        status         TEXT NOT NULL DEFAULT 'discovered',
        is_active      BOOLEAN NOT NULL DEFAULT true,
        last_posted_at TIMESTAMPTZ,
        notes          TEXT,
        joined_at      TIMESTAMPTZ,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
    },
    {
      name: "outreach_templates.create",
      sql: `CREATE TABLE IF NOT EXISTS outreach_templates (
        id         SERIAL PRIMARY KEY,
        name       TEXT NOT NULL,
        body       TEXT NOT NULL,
        is_active  BOOLEAN NOT NULL DEFAULT true,
        use_count  INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
    },
    {
      name: "outreach_posts.create",
      sql: `CREATE TABLE IF NOT EXISTS outreach_posts (
        id            SERIAL PRIMARY KEY,
        group_id      INTEGER REFERENCES outreach_groups(id),
        template_id   INTEGER REFERENCES outreach_templates(id),
        rendered_body TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'pending',
        sent_at       TIMESTAMPTZ,
        error         TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
    },
    {
      name: "outreach.indexes",
      sql: `CREATE INDEX IF NOT EXISTS outreach_groups_status_idx  ON outreach_groups(status);
            CREATE INDEX IF NOT EXISTS outreach_posts_group_id_idx ON outreach_posts(group_id);
            CREATE INDEX IF NOT EXISTS outreach_posts_sent_at_idx  ON outreach_posts(sent_at)`,
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

  // Binance price feed — streams real-time prices for all trading assets.
  // broadcastToAll pushes price_update events to every connected WS client.
  initBinanceFeed((symbol, price) => {
    broadcastToAll("price_update", { symbol, price, at: Date.now() });
  });

  // Forex / Commodities feed — polls Yahoo Finance every 6 s (no API key required server-side).
  // Prices are written into the shared Binance cache via setExternalPrice so getPrice() works for all symbols.
  initForexFeed((symbol, price) => {
    setExternalPrice(symbol, price);
    broadcastToAll("price_update", { symbol, price, at: Date.now() });
  });

  // Settlement scheduler — checks for expired trading positions every second
  // and settles them against the Binance price snapshot.
  startTradingSettlementScheduler();
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
