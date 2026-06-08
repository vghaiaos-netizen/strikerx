import { Router, type IRouter } from "express";
import { db, playersTable, transactionsTable, gamesTable, referralsTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { getStreakReward, getNextStreakMilestone } from "../lib/gameEngine";
import { getCashbackStatus, claimCashback } from "../lib/cashbackService";
import { getPlayerAchievements, checkAndAward } from "../lib/achievementsService";
import { broadcastToAll } from "../lib/wsServer";

const router: IRouter = Router();

// GET /players/me
router.get("/players/me", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const wagerRequirement = parseFloat(process.env.WELCOME_BONUS_STRIKER ?? "500") * parseFloat(process.env.WAGER_REQUIREMENT_MULTIPLIER ?? "10");
  res.json({
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
    wagerProgress: Math.min(100, (player.strikerWageredSinceBonus / wagerRequirement) * 100),
    createdAt: player.createdAt.toISOString(),
  });
});

// GET /players/me/stats
router.get("/players/me/stats", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;

  const games = await db
    .select()
    .from(gamesTable)
    .where(eq(gamesTable.playerId, playerId));

  const totalGames = games.length;
  const totalWagered = games.reduce((sum, g) => sum + g.betStriker, 0);
  const totalWon = games.reduce((sum, g) => sum + g.winAmount, 0);
  const biggestWin = Math.max(0, ...games.map((g) => g.winAmount));
  const biggestMultiplier = Math.max(0, ...games.map((g) => g.resultMultiplier));
  const wins = games.filter((g) => g.outcome !== "loss").length;
  const winRate = totalGames > 0 ? (wins / totalGames) * 100 : 0;

  // Favorite game
  const gameCounts: Record<string, number> = {};
  for (const g of games) {
    gameCounts[g.gameType] = (gameCounts[g.gameType] ?? 0) + 1;
  }
  const favoriteGame = Object.entries(gameCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "shot";

  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
  const vipThresholds: Record<string, number> = {
    sunday_league: 50,
    championship: 200,
    premier_league: 500,
    champions_league: 1000,
    world_cup: 1000,
  };
  const currentThreshold = vipThresholds[player?.vipTier ?? "sunday_league"] ?? 50;
  const prevThreshold = { championship: 50, premier_league: 200, champions_league: 500, world_cup: 1000 }[player?.vipTier ?? ""] ?? 0;
  const vipProgress = Math.min(100, ((player?.tonWageredLifetime ?? 0) - prevThreshold) / (currentThreshold - prevThreshold) * 100);

  res.json({
    totalGames,
    totalWagered,
    totalWon,
    biggestWin,
    biggestMultiplier,
    favoriteGame,
    winRate: parseFloat(winRate.toFixed(1)),
    vipProgress: parseFloat(vipProgress.toFixed(1)),
  });
});

// GET /players/me/streak
router.get("/players/me/streak", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lastClaim = player.lastStreakClaim;
  let canClaim = true;
  if (lastClaim) {
    const lastClaimDay = new Date(lastClaim);
    lastClaimDay.setHours(0, 0, 0, 0);
    canClaim = lastClaimDay.getTime() < today.getTime();
  }

  res.json({
    streakDays: player.streakDays,
    lastClaimDate: lastClaim?.toISOString() ?? null,
    nextReward: getStreakReward(player.streakDays),
    nextMilestone: getNextStreakMilestone(player.streakDays),
    canClaim,
  });
});

// POST /players/me/streak/claim
router.post("/players/me/streak/claim", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lastClaim = player.lastStreakClaim;
  if (lastClaim) {
    const lastClaimDay = new Date(lastClaim);
    lastClaimDay.setHours(0, 0, 0, 0);
    if (lastClaimDay.getTime() >= today.getTime()) {
      res.status(400).json({ error: "Already claimed today" });
      return;
    }

    // Check if streak is broken (more than 1 day gap)
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (lastClaimDay.getTime() < yesterday.getTime()) {
      // Streak broken — reset
      await db.update(playersTable).set({ streakDays: 0 }).where(eq(playersTable.id, playerId));
      player.streakDays = 0;
    }
  }

  const newStreakDays = player.streakDays + 1;
  const reward = getStreakReward(player.streakDays);

  await db
    .update(playersTable)
    .set({
      streakDays: newStreakDays,
      lastStreakClaim: new Date(),
      strikerBalance: sql`${playersTable.strikerBalance} + ${reward}`,
    })
    .where(eq(playersTable.id, playerId));

  // Record bonus transaction
  await db.insert(transactionsTable).values({
    playerId,
    type: "bonus",
    amountStriker: reward,
    status: "completed",
  });

  // fire-and-forget streak achievement check
  checkAndAward(playerId, { event: "streak_claimed", streakDays: newStreakDays })
    .then(awarded => {
      if (awarded.length > 0) broadcastToAll("achievement_unlocked", { playerId, username: player.username, keys: awarded, at: Date.now() });
    })
    .catch(() => {});

  res.json({
    streakDays: newStreakDays,
    lastClaimDate: new Date().toISOString(),
    nextReward: getStreakReward(newStreakDays),
    nextMilestone: getNextStreakMilestone(newStreakDays),
    canClaim: false,
  });
});

// GET /players/me/referral
router.get("/players/me/referral", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const refs = await db.select().from(referralsTable).where(eq(referralsTable.referrerId, playerId));
  const totalReferred = refs.length;
  const tier1 = refs.filter((r) => r.tier === 1);
  const tier2 = refs.filter((r) => r.tier === 2);
  const tier1Earnings = tier1.reduce((s, r) => s + r.earningsPaidStriker, 0);
  const tier2Earnings = tier2.reduce((s, r) => s + r.earningsPaidStriker, 0);
  const miniAppLink = process.env.MINI_APP_LINK ?? "t.me/StrykkerXBot/StrikerX";

  res.json({
    code: player.referralCode,
    referralLink: `https://${miniAppLink}?startapp=${player.referralCode}`,
    totalReferred,
    totalEarned: tier1Earnings + tier2Earnings,
    tier1Earnings,
    tier2Earnings,
  });
});

// GET /players/me/cashback
router.get("/players/me/cashback", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  try {
    const status = await getCashbackStatus(playerId);
    res.json(status);
  } catch (err) {
    req.log.error({ err }, "Failed to get cashback status");
    res.status(500).json({ error: "Failed to get cashback status" });
  }
});

// POST /players/me/cashback/claim
router.post("/players/me/cashback/claim", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  try {
    const result = await claimCashback(playerId);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to claim cashback";
    res.status(400).json({ error: msg });
  }
});

// GET /players/me/achievements
router.get("/players/me/achievements", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  try {
    const achievements = await getPlayerAchievements(playerId);
    res.json(achievements);
  } catch (err) {
    req.log.error({ err }, "Failed to get achievements");
    res.status(500).json({ error: "Failed to get achievements" });
  }
});

// GET /players/me/referrals/detail
router.get("/players/me/referrals/detail", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  const refs = await db.select().from(referralsTable).where(eq(referralsTable.referrerId, playerId));

  const referees = await Promise.all(
    refs.map(async (ref) => {
      const [refPlayer] = await db.select().from(playersTable).where(eq(playersTable.id, ref.referredId));
      return {
        username: refPlayer?.username ?? "Unknown",
        tier: ref.tier,
        earnedStriker: ref.earningsPaidStriker,
        joinedAt: ref.createdAt.toISOString(),
        isActive: ref.isActive === "active",
      };
    })
  );

  const tier1 = refs.filter(r => r.tier === 1);
  const tier2 = refs.filter(r => r.tier === 2);
  const miniAppLink = process.env.MINI_APP_LINK ?? "t.me/StrykkerXBot/StrikerX";

  // Fire achievement check for referral count
  checkAndAward(playerId, {
    event: "referral_joined",
    referralCount: refs.length,
  }).catch(() => {});

  res.json({
    code: player.referralCode,
    referralLink: `https://${miniAppLink}?startapp=${player.referralCode}`,
    totalReferred: refs.length,
    totalEarned: refs.reduce((s, r) => s + r.earningsPaidStriker, 0),
    tier1Earnings: tier1.reduce((s, r) => s + r.earningsPaidStriker, 0),
    tier2Earnings: tier2.reduce((s, r) => s + r.earningsPaidStriker, 0),
    referees,
  });
});

// GET /players/me/transactions
router.get("/players/me/transactions", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  const limit = parseInt(String(req.query.limit ?? 20));
  const offset = parseInt(String(req.query.offset ?? 0));

  const txs = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.playerId, playerId))
    .orderBy(desc(transactionsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json(
    txs.map((t) => ({
      id: t.id,
      type: t.type,
      amountStriker: t.amountStriker,
      amountTon: t.amountTon ?? null,
      currency: t.currency ?? null,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
    }))
  );
});

// POST /players/me/boot/redeem
router.post("/players/me/boot/redeem", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  const { amount } = req.body as { amount: number };

  if (!amount || amount <= 0 || !Number.isFinite(amount)) {
    res.status(400).json({ error: "Invalid amount" }); return;
  }

  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  const redeemAmount = Math.floor(Math.min(amount, player.bootBalance));
  if (redeemAmount < 1) { res.status(400).json({ error: "Insufficient BOOT balance" }); return; }

  await db.update(playersTable).set({
    bootBalance: sql`${playersTable.bootBalance} - ${redeemAmount}`,
    strikerBalance: sql`${playersTable.strikerBalance} + ${redeemAmount}`,
  }).where(eq(playersTable.id, playerId));
  await db.insert(transactionsTable).values({ playerId, type: "bonus", amountStriker: redeemAmount, status: "completed" });

  const [updated] = await db.select({ strikerBalance: playersTable.strikerBalance, bootBalance: playersTable.bootBalance }).from(playersTable).where(eq(playersTable.id, playerId));
  res.json({ redeemedBoot: redeemAmount, newStrikerBalance: updated?.strikerBalance ?? 0, newBootBalance: updated?.bootBalance ?? 0 });
});

export default router;
