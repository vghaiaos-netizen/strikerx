import { Router, type IRouter } from "express";
import { db, playersTable, gamesTable, withdrawalsTable, transactionsTable, jackpotTable, tournamentsTable, auditLogTable } from "@workspace/db";
import { eq, desc, ilike, and, sql, gte } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";
import { broadcastMessage } from "../lib/groupBot";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// GET /admin/overview
router.get("/admin/overview", requireAdmin, async (req, res): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalPlayers] = await db.select({ count: sql<number>`COUNT(*)` }).from(playersTable);
  const [newSignups] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(playersTable)
    .where(gte(playersTable.createdAt, today));

  const [flagged] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(playersTable)
    .where(eq(playersTable.isFlagged, true));

  const [pendingWithdrawals] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(withdrawalsTable)
    .where(eq(withdrawalsTable.status, "under_review"));

  // Today's game volume in TON
  const todayGames = await db
    .select({ betStriker: gamesTable.betStriker, winAmount: gamesTable.winAmount })
    .from(gamesTable)
    .where(gte(gamesTable.createdAt, today));

  const depositRate = parseFloat(process.env.STRIKER_DEPOSIT_RATE ?? "100");
  const todayVolumeTon = todayGames.reduce((s, g) => s + g.betStriker / depositRate, 0);
  const todayEdgeProfit = todayGames.reduce((s, g) => {
    const houseEdge = 0.04;
    return s + (g.betStriker / depositRate) * houseEdge;
  }, 0);

  const [jackpot] = await db.select().from(jackpotTable).limit(1);

  res.json({
    playersOnline: Math.floor(Math.random() * 50) + 1, // Approximate — would need Redis for real presence
    todayVolumeTon: parseFloat(todayVolumeTon.toFixed(4)),
    todayProfitTon: parseFloat(todayEdgeProfit.toFixed(4)),
    todayEdgeProfit: parseFloat(todayEdgeProfit.toFixed(4)),
    todaySpreadProfit: 0,
    todayRakeProfit: 0,
    pendingWithdrawals: Number(pendingWithdrawals?.count ?? 0),
    jackpotAmount: jackpot?.currentAmountTon ?? 0,
    newSignupsToday: Number(newSignups?.count ?? 0),
    totalPlayers: Number(totalPlayers?.count ?? 0),
    flaggedPlayers: Number(flagged?.count ?? 0),
  });
});

// GET /admin/players
router.get("/admin/players", requireAdmin, async (req, res): Promise<void> => {
  const search = String(req.query.search ?? "");
  const limit = parseInt(String(req.query.limit ?? 50));
  const offset = parseInt(String(req.query.offset ?? 0));
  const onlyFlagged = req.query.flagged === "true";

  let query = db.select().from(playersTable);

  const players = await db
    .select()
    .from(playersTable)
    .where(
      onlyFlagged
        ? eq(playersTable.isFlagged, true)
        : search
        ? ilike(playersTable.username, `%${search}%`)
        : undefined
    )
    .orderBy(desc(playersTable.createdAt))
    .limit(limit)
    .offset(offset);

  const result = await Promise.all(
    players.map(async (p) => {
      const [gamesCount] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(gamesTable)
        .where(eq(gamesTable.playerId, p.id));
      return {
        id: p.id,
        telegramId: p.telegramId,
        username: p.username,
        strikerBalance: p.strikerBalance,
        bootBalance: p.bootBalance,
        captainBalance: p.captainBalance,
        vipTier: p.vipTier,
        tonWageredLifetime: p.tonWageredLifetime,
        streakDays: p.streakDays,
        isBanned: p.isBanned,
        isFlagged: p.isFlagged,
        totalGames: Number(gamesCount?.count ?? 0),
        totalDeposited: 0,
        totalWithdrawn: 0,
        referralCode: p.referralCode,
        deviceFingerprint: p.deviceFingerprint ?? null,
        createdAt: p.createdAt.toISOString(),
      };
    })
  );

  res.json(result);
});

// GET /admin/players/:id
router.get("/admin/players/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, id));
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  const [gamesCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(gamesTable).where(eq(gamesTable.playerId, id));
  res.json({
    id: player.id,
    telegramId: player.telegramId,
    username: player.username,
    strikerBalance: player.strikerBalance,
    bootBalance: player.bootBalance,
    captainBalance: player.captainBalance,
    vipTier: player.vipTier,
    tonWageredLifetime: player.tonWageredLifetime,
    streakDays: player.streakDays,
    isBanned: player.isBanned,
    isFlagged: player.isFlagged,
    totalGames: Number(gamesCount?.count ?? 0),
    totalDeposited: 0,
    totalWithdrawn: 0,
    referralCode: player.referralCode,
    deviceFingerprint: player.deviceFingerprint ?? null,
    createdAt: player.createdAt.toISOString(),
  });
});

// PATCH /admin/players/:id
router.patch("/admin/players/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { isBanned, isFlagged, strikerBalance, vipTier, banReason } = req.body as {
    isBanned?: boolean;
    isFlagged?: boolean;
    strikerBalance?: number;
    vipTier?: string;
    banReason?: string;
  };

  const updates: Partial<typeof playersTable.$inferInsert> = {};
  if (isBanned !== undefined) updates.isBanned = isBanned;
  if (isFlagged !== undefined) updates.isFlagged = isFlagged;
  if (strikerBalance !== undefined) updates.strikerBalance = strikerBalance;
  if (vipTier !== undefined) updates.vipTier = vipTier;
  if (banReason !== undefined) updates.banReason = banReason;

  await db.update(playersTable).set(updates).where(eq(playersTable.id, id));

  // Audit log
  await db.insert(auditLogTable).values({
    adminAction: "update_player",
    targetPlayerId: id,
    newValue: JSON.stringify(updates),
    performedBy: "admin",
  });

  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, id));
  res.json({
    id: player.id,
    telegramId: player.telegramId,
    username: player.username,
    strikerBalance: player.strikerBalance,
    bootBalance: player.bootBalance,
    captainBalance: player.captainBalance,
    vipTier: player.vipTier,
    tonWageredLifetime: player.tonWageredLifetime,
    streakDays: player.streakDays,
    isBanned: player.isBanned,
    isFlagged: player.isFlagged,
    totalGames: 0,
    totalDeposited: 0,
    totalWithdrawn: 0,
    referralCode: player.referralCode,
    deviceFingerprint: player.deviceFingerprint ?? null,
    createdAt: player.createdAt.toISOString(),
  });
});

// GET /admin/withdrawals
router.get("/admin/withdrawals", requireAdmin, async (_req, res): Promise<void> => {
  const withdrawals = await db
    .select()
    .from(withdrawalsTable)
    .where(eq(withdrawalsTable.status, "under_review"))
    .orderBy(desc(withdrawalsTable.createdAt))
    .limit(100);

  const result = await Promise.all(
    withdrawals.map(async (w) => {
      const [player] = await db.select().from(playersTable).where(eq(playersTable.id, w.playerId));
      return {
        id: w.id,
        playerId: w.playerId,
        username: player?.username ?? "Unknown",
        amountStriker: w.amountStriker,
        amountTon: w.amountTon,
        destinationAddress: w.destinationAddress,
        currency: w.currency,
        status: w.status,
        reviewedBy: w.reviewedBy ?? null,
        createdAt: w.createdAt.toISOString(),
      };
    })
  );

  res.json(result);
});

// POST /admin/withdrawals/:id/approve
router.post("/admin/withdrawals/:id/approve", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [withdrawal] = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.id, id));
  if (!withdrawal) {
    res.status(404).json({ error: "Withdrawal not found" });
    return;
  }

  await db
    .update(withdrawalsTable)
    .set({ status: "approved", reviewedBy: "admin" })
    .where(eq(withdrawalsTable.id, id));

  // Mark first withdrawal as reviewed
  await db
    .update(playersTable)
    .set({ firstWithdrawalReviewed: true })
    .where(eq(playersTable.id, withdrawal.playerId));

  await db.insert(auditLogTable).values({
    adminAction: "approve_withdrawal",
    targetPlayerId: withdrawal.playerId,
    newValue: `${withdrawal.amountTon} TON`,
    performedBy: "admin",
  });

  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, withdrawal.playerId));
  res.json({
    id: withdrawal.id,
    playerId: withdrawal.playerId,
    username: player?.username ?? "Unknown",
    amountStriker: withdrawal.amountStriker,
    amountTon: withdrawal.amountTon,
    destinationAddress: withdrawal.destinationAddress,
    currency: withdrawal.currency,
    status: "approved",
    reviewedBy: "admin",
    createdAt: withdrawal.createdAt.toISOString(),
  });
});

// POST /admin/withdrawals/:id/reject
router.post("/admin/withdrawals/:id/reject", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [withdrawal] = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.id, id));
  if (!withdrawal) {
    res.status(404).json({ error: "Withdrawal not found" });
    return;
  }

  await db
    .update(withdrawalsTable)
    .set({ status: "rejected", reviewedBy: "admin" })
    .where(eq(withdrawalsTable.id, id));

  // Refund striker
  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, withdrawal.playerId));
  if (player) {
    await db
      .update(playersTable)
      .set({ strikerBalance: player.strikerBalance + withdrawal.amountStriker })
      .where(eq(playersTable.id, withdrawal.playerId));
  }

  res.json({
    id: withdrawal.id,
    playerId: withdrawal.playerId,
    username: player?.username ?? "Unknown",
    amountStriker: withdrawal.amountStriker,
    amountTon: withdrawal.amountTon,
    destinationAddress: withdrawal.destinationAddress,
    currency: withdrawal.currency,
    status: "rejected",
    reviewedBy: "admin",
    createdAt: withdrawal.createdAt.toISOString(),
  });
});

// POST /admin/broadcast
router.post("/admin/broadcast", requireAdmin, async (req, res): Promise<void> => {
  const { message, buttonText, buttonUrl } = req.body as { message: string; buttonText?: string; buttonUrl?: string };
  if (!message) {
    res.status(400).json({ error: "Message required" });
    return;
  }
  await broadcastMessage(message, buttonText, buttonUrl);
  res.json({ ok: true });
});

// POST /admin/jackpot/seed
router.post("/admin/jackpot/seed", requireAdmin, async (req, res): Promise<void> => {
  const { amountTon } = req.body as { amountTon: number };
  if (!amountTon || amountTon <= 0) {
    res.status(400).json({ error: "Invalid amount" });
    return;
  }

  const [jackpot] = await db.select().from(jackpotTable).limit(1);
  const minPool = parseFloat(process.env.JACKPOT_MIN_POOL ?? "50");

  if (jackpot) {
    const newAmount = jackpot.currentAmountTon + amountTon;
    await db
      .update(jackpotTable)
      .set({
        currentAmountTon: newAmount,
        status: newAmount >= minPool ? "ready" : "building",
      })
      .where(eq(jackpotTable.id, jackpot.id));
    res.json({
      currentAmountTon: newAmount,
      minimumTrigger: minPool,
      status: newAmount >= minPool ? "ready" : "building",
      lastWinner: jackpot.lastWinnerUsername ?? null,
      lastTriggeredAt: jackpot.lastTriggeredAt?.toISOString() ?? null,
      percentFull: Math.min(100, (newAmount / minPool) * 100),
    });
  } else {
    const inserted = await db.insert(jackpotTable).values({ currentAmountTon: amountTon, status: "building" }).returning();
    const j = inserted[0];
    res.json({
      currentAmountTon: j.currentAmountTon,
      minimumTrigger: minPool,
      status: j.status,
      lastWinner: null,
      lastTriggeredAt: null,
      percentFull: Math.min(100, (j.currentAmountTon / minPool) * 100),
    });
  }
});

// POST /admin/tournament
router.post("/admin/tournament", requireAdmin, async (req, res): Promise<void> => {
  const { type, prizePoolTon, durationHours, entryFeeBoots } = req.body as {
    type: string;
    prizePoolTon: number;
    durationHours: number;
    entryFeeBoots?: number;
  };

  const startTime = new Date();
  const endTime = new Date(startTime.getTime() + durationHours * 3600000);

  const [tournament] = await db
    .insert(tournamentsTable)
    .values({ type, prizePoolTon, entryFeeBoots: entryFeeBoots ?? null, status: "active", startTime, endTime })
    .returning();

  res.status(201).json({
    id: tournament.id,
    type: tournament.type,
    prizePoolTon: tournament.prizePoolTon,
    status: tournament.status,
    startTime: tournament.startTime.toISOString(),
    endTime: tournament.endTime.toISOString(),
    entryFeeBoots: tournament.entryFeeBoots ?? null,
    topEntries: [],
  });
});

// GET /admin/config
router.get("/admin/config", requireAdmin, async (_req, res): Promise<void> => {
  res.json({
    houseEdgeShot: parseFloat(process.env.HOUSE_EDGE_SHOT ?? "4"),
    houseEdgePenalty: parseFloat(process.env.HOUSE_EDGE_PENALTY ?? "4"),
    houseEdgeMinefield: parseFloat(process.env.HOUSE_EDGE_MINEFIELD ?? "4"),
    houseEdgeFreekick: parseFloat(process.env.HOUSE_EDGE_FREEKICK ?? "4"),
    strikerDepositRate: parseFloat(process.env.STRIKER_DEPOSIT_RATE ?? "100"),
    strikerWithdrawRate: parseFloat(process.env.STRIKER_WITHDRAW_RATE ?? "110"),
    minDepositTon: parseFloat(process.env.MIN_DEPOSIT_TON ?? "0.5"),
    minWithdrawStriker: parseFloat(process.env.MIN_WITHDRAW_STRIKER ?? "1000"),
    wagerRequirementMultiplier: parseFloat(process.env.WAGER_REQUIREMENT_MULTIPLIER ?? "10"),
    jackpotPercentage: parseFloat(process.env.JACKPOT_PERCENTAGE ?? "1"),
    jackpotMinPool: parseFloat(process.env.JACKPOT_MIN_POOL ?? "50"),
  });
});

// PATCH /admin/config
router.patch("/admin/config", requireAdmin, async (req, res): Promise<void> => {
  // In a real system, these would update the DB and be read from there.
  // For now, they update env vars at runtime (not persistent across restarts).
  const updates = req.body as Record<string, number>;
  const envMap: Record<string, string> = {
    houseEdgeShot: "HOUSE_EDGE_SHOT",
    houseEdgePenalty: "HOUSE_EDGE_PENALTY",
    houseEdgeMinefield: "HOUSE_EDGE_MINEFIELD",
    houseEdgeFreekick: "HOUSE_EDGE_FREEKICK",
    strikerDepositRate: "STRIKER_DEPOSIT_RATE",
    strikerWithdrawRate: "STRIKER_WITHDRAW_RATE",
    minDepositTon: "MIN_DEPOSIT_TON",
    minWithdrawStriker: "MIN_WITHDRAW_STRIKER",
    wagerRequirementMultiplier: "WAGER_REQUIREMENT_MULTIPLIER",
  };
  for (const [key, envKey] of Object.entries(envMap)) {
    if (updates[key] !== undefined) {
      process.env[envKey] = String(updates[key]);
    }
  }
  res.json({
    houseEdgeShot: parseFloat(process.env.HOUSE_EDGE_SHOT ?? "4"),
    houseEdgePenalty: parseFloat(process.env.HOUSE_EDGE_PENALTY ?? "4"),
    houseEdgeMinefield: parseFloat(process.env.HOUSE_EDGE_MINEFIELD ?? "4"),
    houseEdgeFreekick: parseFloat(process.env.HOUSE_EDGE_FREEKICK ?? "4"),
    strikerDepositRate: parseFloat(process.env.STRIKER_DEPOSIT_RATE ?? "100"),
    strikerWithdrawRate: parseFloat(process.env.STRIKER_WITHDRAW_RATE ?? "110"),
    minDepositTon: parseFloat(process.env.MIN_DEPOSIT_TON ?? "0.5"),
    minWithdrawStriker: parseFloat(process.env.MIN_WITHDRAW_STRIKER ?? "1000"),
    wagerRequirementMultiplier: parseFloat(process.env.WAGER_REQUIREMENT_MULTIPLIER ?? "10"),
    jackpotPercentage: parseFloat(process.env.JACKPOT_PERCENTAGE ?? "1"),
    jackpotMinPool: parseFloat(process.env.JACKPOT_MIN_POOL ?? "50"),
  });
});

// GET /admin/analytics
router.get("/admin/analytics", requireAdmin, async (req, res): Promise<void> => {
  const days = parseInt(String(req.query.days ?? 7));
  const since = new Date();
  since.setDate(since.getDate() - days);

  const depositRate = parseFloat(process.env.STRIKER_DEPOSIT_RATE ?? "100");

  // Daily revenue aggregation
  const dailyRevenue = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);

    const dayGames = await db
      .select()
      .from(gamesTable)
      .where(and(gte(gamesTable.createdAt, date)));

    const volume = dayGames.reduce((s, g) => s + g.betStriker / depositRate, 0);
    const revenue = volume * 0.04; // 4% house edge approximate

    const [newPlayers] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(playersTable)
      .where(gte(playersTable.createdAt, date));

    dailyRevenue.push({
      date: date.toISOString().split("T")[0],
      revenue: parseFloat(revenue.toFixed(4)),
      volume: parseFloat(volume.toFixed(4)),
      newPlayers: Number(newPlayers?.count ?? 0),
    });
  }

  // Game breakdown
  const gameTypes = ["shot", "penalty", "minefield", "freekick"];
  const gameBreakdown: Record<string, number> = {};
  for (const gt of gameTypes) {
    const [count] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(gamesTable)
      .where(and(eq(gamesTable.gameType, gt), gte(gamesTable.createdAt, since)));
    gameBreakdown[gt] = Number(count?.count ?? 0);
  }

  // VIP distribution
  const vipTiers = ["sunday_league", "championship", "premier_league", "champions_league", "world_cup"];
  const vipDistribution: Record<string, number> = {};
  for (const tier of vipTiers) {
    const [count] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(playersTable)
      .where(eq(playersTable.vipTier, tier));
    vipDistribution[tier] = Number(count?.count ?? 0);
  }

  const totalRevenue = dailyRevenue.reduce((s, d) => s + d.revenue, 0);
  const [newPlayersTotal] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(playersTable)
    .where(gte(playersTable.createdAt, since));

  res.json({
    days,
    dailyRevenue,
    totalRevenue: parseFloat(totalRevenue.toFixed(4)),
    playerGrowth: Number(newPlayersTotal?.count ?? 0),
    gameBreakdown,
    vipDistribution,
  });
});

export default router;
