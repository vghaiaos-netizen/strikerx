import { Router, type IRouter } from "express";
import { db, playersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken, validateTelegramInitData } from "../lib/auth";
import { generateReferralCode } from "../lib/referralCode";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// POST /auth/telegram
router.post("/auth/telegram", async (req, res): Promise<void> => {
  const { initData, referralCode, deviceFingerprint } = req.body as {
    initData?: string;
    referralCode?: string;
    deviceFingerprint?: string;
  };

  if (!initData) {
    res.status(400).json({ error: "initData is required" });
    return;
  }

  const gamebotToken = process.env.GAMEBOT_TOKEN ?? "";

  // In dev mode, allow test initData
  let userData: Record<string, string> | null = null;

  if (process.env.NODE_ENV === "development" && initData.startsWith("dev:")) {
    // Dev bypass: "dev:123456:testuser"
    const parts = initData.split(":");
    userData = {
      user: JSON.stringify({ id: parseInt(parts[1] ?? "123456"), username: parts[2] ?? "testuser", first_name: "Test" }),
    };
  } else {
    userData = validateTelegramInitData(initData, gamebotToken);
  }

  if (!userData?.user) {
    res.status(401).json({ error: "Invalid Telegram init data" });
    return;
  }

  let tgUser: { id: number; username?: string; first_name?: string; last_name?: string };
  try {
    tgUser = JSON.parse(userData.user);
  } catch {
    res.status(401).json({ error: "Invalid user data" });
    return;
  }

  const telegramId = String(tgUser.id);
  const username = tgUser.username ?? tgUser.first_name ?? `user${telegramId}`;

  // Upsert player
  let [player] = await db
    .select()
    .from(playersTable)
    .where(eq(playersTable.telegramId, telegramId));

  if (!player) {
    // New player — welcome bonus
    const welcomeBonus = parseFloat(process.env.WELCOME_BONUS_STRIKER ?? "500");
    const newCode = generateReferralCode();

    // Find referrer if code provided
    let referredByCode: string | undefined;
    if (referralCode) {
      const [referrer] = await db
        .select()
        .from(playersTable)
        .where(eq(playersTable.referralCode, referralCode));
      if (referrer) {
        referredByCode = referralCode;
      }
    }

    const inserted = await db
      .insert(playersTable)
      .values({
        telegramId,
        username,
        firstName: tgUser.first_name,
        lastName: tgUser.last_name,
        strikerBalance: welcomeBonus,
        referralCode: newCode,
        referredBy: referredByCode,
        deviceFingerprint: deviceFingerprint ?? null,
      })
      .returning();
    player = inserted[0];
    req.log.info({ telegramId, username }, "New player registered");
  } else {
    // Update last active
    await db
      .update(playersTable)
      .set({ lastActive: new Date(), username })
      .where(eq(playersTable.id, player.id));
  }

  if (player.isBanned) {
    res.status(403).json({ error: "Account banned" });
    return;
  }

  const token = signToken({ playerId: player.id, telegramId: player.telegramId });

  res.json({
    token,
    player: {
      id: player.id,
      telegramId: player.telegramId,
      username: player.username,
      strikerBalance: player.strikerBalance,
      bootBalance: player.bootBalance,
      captainBalance: player.captainBalance,
      vipTier: player.vipTier,
      streakDays: player.streakDays,
      tonWageredLifetime: player.tonWageredLifetime,
      referralCode: player.referralCode,
      isBanned: player.isBanned,
      isFlagged: player.isFlagged,
      wagerProgress: Math.min(100, (player.strikerWageredSinceBonus / (parseFloat(process.env.WAGER_REQUIREMENT_MULTIPLIER ?? "10") * 500)) * 100),
      createdAt: player.createdAt.toISOString(),
    },
  });
});

// POST /auth/admin/login
router.post("/auth/admin/login", async (req, res): Promise<void> => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    res.status(400).json({ error: "Username and password required" });
    return;
  }

  const adminUsername = process.env.ADMIN_USERNAME ?? "admin";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "admin123";

  if (username !== adminUsername || password !== adminPassword) {
    req.log.warn({ username }, "Failed admin login attempt");
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = signToken({ playerId: 0, telegramId: "admin", isAdmin: true }, "24h");

  res.json({
    token,
    player: {
      id: 0,
      telegramId: "admin",
      username: "Admin",
      strikerBalance: 0,
      bootBalance: 0,
      captainBalance: 0,
      vipTier: "world_cup",
      streakDays: 0,
      tonWageredLifetime: 0,
      referralCode: "ADMIN",
      isBanned: false,
      isFlagged: false,
      wagerProgress: 0,
      createdAt: new Date().toISOString(),
    },
  });
});

export default router;
