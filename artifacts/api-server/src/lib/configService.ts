import { db, appConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export interface ConfigEntry {
  key: string;
  value: string;
  category: string;
  label: string;
  description?: string | null;
  isSecret: boolean;
  isRestartRequired: boolean;
  updatedAt: Date;
}

const DEFAULT_CONFIG: Array<Omit<ConfigEntry, "updatedAt">> = [
  // Game settings
  { key: "house_edge_shot", value: "4", category: "game", label: "House Edge — The Shot (%)", description: "House edge percentage for the crash game", isSecret: false, isRestartRequired: false },
  { key: "house_edge_penalty", value: "4", category: "game", label: "House Edge — Penalty (%)", description: "House edge percentage for the penalty game", isSecret: false, isRestartRequired: false },
  { key: "house_edge_minefield", value: "4", category: "game", label: "House Edge — Minefield (%)", description: "House edge percentage for the minefield game", isSecret: false, isRestartRequired: false },
  { key: "house_edge_freekick", value: "4", category: "game", label: "House Edge — Free Kick (%)", description: "House edge percentage for the free kick game", isSecret: false, isRestartRequired: false },
  { key: "min_bet_striker", value: "10", category: "game", label: "Minimum Bet (STRIKER)", description: "Minimum bet amount in STRIKER tokens", isSecret: false, isRestartRequired: false },
  { key: "max_bet_striker", value: "10000", category: "game", label: "Maximum Bet (STRIKER)", description: "Maximum bet amount in STRIKER tokens", isSecret: false, isRestartRequired: false },
  // Payment settings
  { key: "striker_deposit_rate", value: "100", category: "payment", label: "STRIKER per TON (Deposit)", description: "How many STRIKER tokens per 1 TON deposited", isSecret: false, isRestartRequired: false },
  { key: "striker_withdraw_rate", value: "110", category: "payment", label: "STRIKER per TON (Withdrawal)", description: "How many STRIKER tokens equal 1 TON for withdrawals (higher = less TON per STRIKER)", isSecret: false, isRestartRequired: false },
  { key: "min_deposit_ton", value: "0.5", category: "payment", label: "Minimum Deposit (TON)", description: "Minimum deposit amount in TON", isSecret: false, isRestartRequired: false },
  { key: "min_withdraw_striker", value: "1000", category: "payment", label: "Minimum Withdrawal (STRIKER)", description: "Minimum withdrawal in STRIKER tokens", isSecret: false, isRestartRequired: false },
  { key: "wager_requirement_multiplier", value: "10", category: "payment", label: "Wager Requirement Multiplier", description: "Player must wager deposit × this value before withdrawing", isSecret: false, isRestartRequired: false },
  // Jackpot settings
  { key: "jackpot_percentage", value: "1", category: "jackpot", label: "Jackpot Pool Contribution (%)", description: "% of each bet that goes to the jackpot pool", isSecret: false, isRestartRequired: false },
  { key: "jackpot_min_pool", value: "50", category: "jackpot", label: "Jackpot Minimum Pool (TON)", description: "Minimum pool size before jackpot can trigger", isSecret: false, isRestartRequired: false },
  { key: "jackpot_seed_amount", value: "10", category: "jackpot", label: "Jackpot Seed Amount (TON)", description: "Amount to seed the jackpot after each trigger", isSecret: false, isRestartRequired: false },
  { key: "jackpot_house_cut", value: "10", category: "jackpot", label: "Jackpot House Cut (%)", description: "House takes this % of each jackpot trigger", isSecret: false, isRestartRequired: false },
  // VIP settings
  { key: "vip_championship_ton", value: "50", category: "vip", label: "Championship Tier (TON wagered)", description: "TON wagered lifetime required for Championship VIP", isSecret: false, isRestartRequired: false },
  { key: "vip_premier_ton", value: "200", category: "vip", label: "Premier League Tier (TON wagered)", description: "TON wagered lifetime required for Premier League VIP", isSecret: false, isRestartRequired: false },
  { key: "vip_champions_ton", value: "500", category: "vip", label: "Champions League Tier (TON wagered)", description: "TON wagered lifetime required for Champions League VIP", isSecret: false, isRestartRequired: false },
  { key: "vip_worldcup_ton", value: "1000", category: "vip", label: "World Cup Tier (TON wagered)", description: "TON wagered lifetime required for World Cup VIP", isSecret: false, isRestartRequired: false },
  // Referral settings
  { key: "referral_tier1_pct", value: "10", category: "referral", label: "Referral Tier 1 (%)", description: "Lifetime % earned from direct referral bets", isSecret: false, isRestartRequired: false },
  { key: "referral_tier2_pct", value: "5", category: "referral", label: "Referral Tier 2 (%)", description: "Lifetime % earned from 2nd-tier referral bets", isSecret: false, isRestartRequired: false },
  // Bot & integrations
  { key: "gamebot_token", value: "", category: "bot", label: "GameBot Token", description: "Telegram bot token for the GameBot (@StrykkerXBot)", isSecret: true, isRestartRequired: true },
  { key: "groupbot_token", value: "", category: "bot", label: "GroupBot Token", description: "Telegram bot token for the GroupBot", isSecret: true, isRestartRequired: true },
  { key: "cryptobot_token", value: "", category: "bot", label: "CryptoBot API Token", description: "CryptoBot (crypto-pay) API token for processing payments", isSecret: true, isRestartRequired: false },
  { key: "mini_app_link", value: "t.me/StrykkerXBot/StrikerX", category: "bot", label: "Mini App Link", description: "Telegram Mini App deep link shown in bot messages", isSecret: false, isRestartRequired: false },
  // Security
  { key: "session_secret", value: "", category: "security", label: "JWT Session Secret", description: "Secret key for signing JWTs. CHANGING THIS INVALIDATES ALL ACTIVE SESSIONS.", isSecret: true, isRestartRequired: true },
  { key: "admin_username", value: "admin", category: "security", label: "Admin Username", description: "Username for the admin dashboard", isSecret: false, isRestartRequired: false },
  { key: "admin_password", value: "", category: "security", label: "Admin Password", description: "Password for the admin dashboard.", isSecret: true, isRestartRequired: false },
  // Platform
  { key: "welcome_bonus_striker", value: "500", category: "platform", label: "Welcome Bonus (STRIKER)", description: "STRIKER tokens given to new players on first login", isSecret: false, isRestartRequired: false },
  { key: "maintenance_mode", value: "false", category: "platform", label: "Maintenance Mode", description: "When true, all game endpoints return 503. Admin still accessible.", isSecret: false, isRestartRequired: false },
  { key: "max_players_per_round", value: "100", category: "platform", label: "Max Players Per Round", description: "Maximum concurrent players in a crash round", isSecret: false, isRestartRequired: false },
];

/**
 * Canonical mapping: config DB key → environment variable name.
 * Used in two places:
 *   1. getConfig() — env var fallback when DB value is empty
 *   2. syncEnvToDB() — writes env var into DB on startup so the admin UI shows real values
 */
const ENV_MAP: Record<string, string> = {
  house_edge_shot: "HOUSE_EDGE_SHOT",
  house_edge_penalty: "HOUSE_EDGE_PENALTY",
  house_edge_minefield: "HOUSE_EDGE_MINEFIELD",
  house_edge_freekick: "HOUSE_EDGE_FREEKICK",
  striker_deposit_rate: "STRIKER_DEPOSIT_RATE",
  striker_withdraw_rate: "STRIKER_WITHDRAW_RATE",
  min_deposit_ton: "MIN_DEPOSIT_TON",
  min_withdraw_striker: "MIN_WITHDRAW_STRIKER",
  wager_requirement_multiplier: "WAGER_REQUIREMENT_MULTIPLIER",
  jackpot_percentage: "JACKPOT_PERCENTAGE",
  jackpot_min_pool: "JACKPOT_MIN_POOL",
  jackpot_seed_amount: "JACKPOT_SEED_AMOUNT",
  // NOTE: the env var is JWT_SECRET, not SESSION_SECRET
  session_secret: "JWT_SECRET",
  admin_username: "ADMIN_USERNAME",
  admin_password: "ADMIN_PASSWORD",
  gamebot_token: "GAMEBOT_TOKEN",
  groupbot_token: "GROUPBOT_TOKEN",
  cryptobot_token: "CRYPTOBOT_TOKEN",
  mini_app_link: "MINI_APP_LINK",
  welcome_bonus_striker: "WELCOME_BONUS_STRIKER",
};

// In-memory cache
let cache: Map<string, ConfigEntry> = new Map();
let lastLoaded = 0;
const CACHE_TTL_MS = 15_000;

async function seedDefaults() {
  for (const def of DEFAULT_CONFIG) {
    try {
      await db.insert(appConfigTable).values({
        key: def.key,
        value: def.value,
        category: def.category,
        label: def.label,
        description: def.description,
        isSecret: def.isSecret,
        isRestartRequired: def.isRestartRequired,
      }).onConflictDoNothing();
    } catch {
      // ignore
    }
  }
}

async function loadCache() {
  try {
    const rows = await db.select().from(appConfigTable);
    cache = new Map(rows.map(r => [r.key, r]));
    lastLoaded = Date.now();
  } catch (err) {
    logger.warn({ err }, "Failed to load config from DB, using env fallback");
  }
}

/**
 * On startup: for every config key that has a corresponding env var set,
 * write the env var value into the DB row if the DB row is at its seeded default
 * or empty. This ensures:
 *  - The admin config UI shows that secrets are actually set (masked as ••••••••)
 *  - Changing a value in the UI takes effect without redeploying env vars
 *  - The env var still acts as a fallback if the DB is ever wiped
 *
 * "Seeded default" means the DB still has the value from DEFAULT_CONFIG — i.e. the
 * admin hasn't customised it yet. We compare against the default so that keys like
 * admin_username (default "admin") get overwritten by the env var on first boot.
 */
async function syncEnvToDB() {
  let synced = 0;
  const toLog: string[] = [];

  for (const [configKey, envKey] of Object.entries(ENV_MAP)) {
    const envVal = process.env[envKey];
    if (!envVal) continue;

    const entry = cache.get(configKey);
    const defaultVal = DEFAULT_CONFIG.find(d => d.key === configKey)?.value ?? "";
    const dbVal = entry?.value ?? "";

    // Sync if DB is at the seed default or empty — skip if admin has customised it
    if (!entry || dbVal === "" || dbVal === defaultVal) {
      try {
        await db
          .update(appConfigTable)
          .set({ value: envVal, updatedAt: new Date() })
          .where(eq(appConfigTable.key, configKey));

        // Keep in-memory cache consistent so getConfig() sees the new value immediately
        if (entry) {
          cache.set(configKey, { ...entry, value: envVal, updatedAt: new Date() });
        }
        synced++;
        toLog.push(configKey);
      } catch (err) {
        logger.warn({ err, configKey }, "Failed to sync env var to DB");
      }
    }
  }

  if (synced > 0) {
    logger.info({ synced, keys: toLog }, "Synced env vars → DB config (DB was empty; env var values written for admin visibility)");
  }
}

export async function initConfig() {
  await seedDefaults();
  await loadCache();
  await syncEnvToDB();   // mirror any env vars that haven't been written to DB yet
  logger.info({ keys: cache.size }, "Config service initialized");
}

async function ensureFresh() {
  if (Date.now() - lastLoaded > CACHE_TTL_MS) {
    await loadCache();
  }
}

export async function getConfig(key: string): Promise<string> {
  await ensureFresh();
  const entry = cache.get(key);
  if (entry && entry.value !== "") return entry.value;

  // Env var fallback — fires if DB row is empty (e.g. wiped) or key not yet seeded
  const envKey = ENV_MAP[key];
  if (envKey && process.env[envKey]) return process.env[envKey]!;

  // Return default value
  const def = DEFAULT_CONFIG.find(d => d.key === key);
  return def?.value ?? "";
}

export async function getConfigFloat(key: string, fallback = 0): Promise<number> {
  const v = await getConfig(key);
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
}

export async function getConfigBool(key: string, fallback = false): Promise<boolean> {
  const v = await getConfig(key);
  return v === "true" ? true : v === "false" ? false : fallback;
}

export async function setConfig(key: string, value: string) {
  await db.update(appConfigTable).set({ value, updatedAt: new Date() }).where(eq(appConfigTable.key, key));
  // Update cache immediately
  const entry = cache.get(key);
  if (entry) cache.set(key, { ...entry, value, updatedAt: new Date() });
  lastLoaded = 0; // force reload on next request
}

export async function getAllConfig(): Promise<ConfigEntry[]> {
  await ensureFresh();
  return Array.from(cache.values()).sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
}
