import { Router, type IRouter } from "express";
import { db, playersTable, affiliatesTable, transactionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { signToken, validateTelegramInitData } from "../lib/auth";
import { generateReferralCode } from "../lib/referralCode";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// POST /auth/telegram
router.post("/auth/telegram", async (req, res): Promise<void> => {
  const { initData, referralCode, affiliateCode, deviceFingerprint } = req.body as {
    initData?: string;
    referralCode?: string;
    affiliateCode?: string;
    deviceFingerprint?: string;
  };

  if (!initData) {
    res.status(400).json({ error: "initData is required" });
    return;
  }

  const gamebotToken = process.env.GAMEBOT_TOKEN ?? "";

  let userData: Record<string, string> | null = null;

  if (process.env.NODE_ENV === "development" && initData.startsWith("dev:")) {
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

  let [player] = await db
    .select()
    .from(playersTable)
    .where(eq(playersTable.telegramId, telegramId));

  if (!player) {
    const welcomeBonus = parseFloat(process.env.WELCOME_BONUS_STRIKER ?? "500");
    const newCode = generateReferralCode();

    // Resolve referral code (player-to-player)
    let referredByCode: string | undefined;
    if (referralCode) {
      const [referrer] = await db
        .select()
        .from(playersTable)
        .where(eq(playersTable.referralCode, referralCode));
      if (referrer) referredByCode = referralCode;
    }

    // Resolve affiliate/influencer code
    let affiliateCodeApplied: string | undefined;
    if (affiliateCode) {
      const upperCode = affiliateCode.toUpperCase().replace(/[^A-Z0-9_]/g, "");
      if (upperCode) {
        const [aff] = await db
          .select({ id: affiliatesTable.id, totalReferred: affiliatesTable.totalReferred })
          .from(affiliatesTable)
          .where(and(eq(affiliatesTable.code, upperCode), eq(affiliatesTable.isActive, true)));
        if (aff) {
          affiliateCodeApplied = upperCode;
          await db
            .update(affiliatesTable)
            .set({ totalReferred: aff.totalReferred + 1 })
            .where(eq(affiliatesTable.id, aff.id));
        }
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
        affiliateCode: affiliateCodeApplied,
        deviceFingerprint: deviceFingerprint ?? null,
      })
      .returning();
    player = inserted[0];
    req.log.info({ telegramId, username, affiliateCode: affiliateCodeApplied }, "New player registered");

    // Record welcome bonus in transaction history
    if (welcomeBonus > 0) {
      await db.insert(transactionsTable).values({
        playerId: player.id,
        type: "win",
        amountStriker: welcomeBonus,
        status: "completed",
      });
    }
  } else {
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
      kycStatus: player.kycStatus,
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
      kycStatus: "verified",
      isBanned: false,
      isFlagged: false,
      wagerProgress: 0,
      createdAt: new Date().toISOString(),
    },
  });
});

export default router;
