import { Router, type IRouter } from "express";
import { db, playersTable, gamesTable, withdrawalsTable, transactionsTable, jackpotTable, tournamentsTable, auditLogTable, appConfigTable } from "@workspace/db";
import { eq, desc, ilike, and, sql, gte, lt } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";
import { broadcastMessage } from "../lib/groupBot";
import { logger } from "../lib/logger";
import { getAllConfig, setConfig, getConfig, getConfigFloat } from "../lib/configService";
import { processCryptoBotTransfer } from "../lib/cryptobotService";
import { getConnectedClients } from "../lib/wsServer";

const router: IRouter = Router();

// ── OVERVIEW ────────────────────────────────────────────────────────────────

router.get("/admin/overview", requireAdmin, async (req, res): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 86400000);

  const [totalPlayers] = await db.select({ count: sql<number>`COUNT(*)` }).from(playersTable);
  const [newSignups] = await db.select({ count: sql<number>`COUNT(*)` }).from(playersTable).where(gte(playersTable.createdAt, today));
  const [weekSignups] = await db.select({ count: sql<number>`COUNT(*)` }).from(playersTable).where(gte(playersTable.createdAt, weekAgo));
  const [flagged] = await db.select({ count: sql<number>`COUNT(*)` }).from(playersTable).where(eq(playersTable.isFlagged, true));
  const [banned] = await db.select({ count: sql<number>`COUNT(*)` }).from(playersTable).where(eq(playersTable.isBanned, true));

  const [pendingWithdrawals] = await db.select({ count: sql<number>`COUNT(*)` }).from(withdrawalsTable).where(eq(withdrawalsTable.status, "under_review"));
  const [totalWithdrawals] = await db.select({ total: sql<number>`COALESCE(SUM(amount_ton),0)` }).from(withdrawalsTable).where(eq(withdrawalsTable.status, "approved"));

  const depositRate = await getConfigFloat("striker_deposit_rate", 100);

  const todayGames = await db.select({ betStriker: gamesTable.betStriker, winAmount: gamesTable.winAmount }).from(gamesTable).where(gte(gamesTable.createdAt, today));
  const allTimeGames = await db.select({ count: sql<number>`COUNT(*)` }).from(gamesTable);
  const todayVolumeTon = todayGames.reduce((s, g) => s + g.betStriker / depositRate, 0);
  const todayEdgeProfit = todayGames.reduce((s, g) => {
    return s + (g.betStriker / depositRate) * 0.04;
  }, 0);

  const weekGames = await db.select({ betStriker: gamesTable.betStriker }).from(gamesTable).where(gte(gamesTable.createdAt, weekAgo));
  const weekVolumeTon = weekGames.reduce((s, g) => s + g.betStriker / depositRate, 0);
  const weekProfit = weekVolumeTon * 0.04;

  const [jackpot] = await db.select().from(jackpotTable).limit(1);
  const [activeTournament] = await db.select({ count: sql<number>`COUNT(*)` }).from(tournamentsTable).where(eq(tournamentsTable.status, "active"));

  res.json({
    playersOnline: getConnectedClients(),
    totalPlayers: Number(totalPlayers?.count ?? 0),
    newSignupsToday: Number(newSignups?.count ?? 0),
    newSignupsWeek: Number(weekSignups?.count ?? 0),
    flaggedPlayers: Number(flagged?.count ?? 0),
    bannedPlayers: Number(banned?.count ?? 0),
    pendingWithdrawals: Number(pendingWithdrawals?.count ?? 0),
    totalWithdrawnTon: parseFloat(String(totalWithdrawals?.total ?? 0)),
    todayVolumeTon: parseFloat(todayVolumeTon.toFixed(4)),
    todayProfitTon: parseFloat(todayEdgeProfit.toFixed(4)),
    todayEdgeProfit: parseFloat(todayEdgeProfit.toFixed(4)),
    todaySpreadProfit: 0,
    todayRakeProfit: 0,
    weekVolumeTon: parseFloat(weekVolumeTon.toFixed(4)),
    weekProfitTon: parseFloat(weekProfit.toFixed(4)),
    jackpotAmount: jackpot?.currentAmountTon ?? 0,
    jackpotStatus: jackpot?.status ?? "building",
    totalGamesAllTime: Number(allTimeGames[0]?.count ?? 0),
    activeTournaments: Number(activeTournament?.count ?? 0),
  });
});

// ── PLAYERS ─────────────────────────────────────────────────────────────────

router.get("/admin/players", requireAdmin, async (req, res): Promise<void> => {
  const search = String(req.query.search ?? "");
  const limit = Math.min(parseInt(String(req.query.limit ?? 50)), 200);
  const offset = parseInt(String(req.query.offset ?? 0));
  const onlyFlagged = req.query.flagged === "true";
  const onlyBanned = req.query.banned === "true";
  const vipFilter = req.query.vip ? String(req.query.vip) : null;

  const whereCondition = onlyFlagged
    ? eq(playersTable.isFlagged, true)
    : onlyBanned
    ? eq(playersTable.isBanned, true)
    : vipFilter
    ? eq(playersTable.vipTier, vipFilter)
    : search
    ? ilike(playersTable.username, `%${search}%`)
    : undefined;

  const players = await db.select().from(playersTable).where(whereCondition).orderBy(desc(playersTable.createdAt)).limit(limit).offset(offset);
  const [{ count: total }] = await db.select({ count: sql<number>`COUNT(*)` }).from(playersTable).where(whereCondition);

  const result = await Promise.all(
    players.map(async (p) => {
      const [gamesCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(gamesTable).where(eq(gamesTable.playerId, p.id));
      const [depositTotal] = await db.select({ total: sql<number>`COALESCE(SUM(amount_striker),0)` }).from(transactionsTable).where(and(eq(transactionsTable.playerId, p.id), eq(transactionsTable.type, "deposit")));
      const [withdrawTotal] = await db.select({ total: sql<number>`COALESCE(SUM(amount_striker),0)` }).from(transactionsTable).where(and(eq(transactionsTable.playerId, p.id), eq(transactionsTable.type, "withdrawal")));
      return {
        id: p.id,
        telegramId: p.telegramId,
        username: p.username,
        firstName: p.firstName,
        lastName: p.lastName,
        strikerBalance: p.strikerBalance,
        bootBalance: p.bootBalance,
        captainBalance: p.captainBalance,
        vipTier: p.vipTier,
        tonWageredLifetime: p.tonWageredLifetime,
        streakDays: p.streakDays,
        isBanned: p.isBanned,
        isFlagged: p.isFlagged,
        banReason: p.banReason ?? null,
        totalGames: Number(gamesCount?.count ?? 0),
        totalDepositedStriker: Number(depositTotal?.total ?? 0),
        totalWithdrawnStriker: Number(withdrawTotal?.total ?? 0),
        referralCode: p.referralCode,
        referredBy: p.referredBy ?? null,
        deviceFingerprint: p.deviceFingerprint ?? null,
        lastActive: p.lastActive?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
      };
    })
  );

  res.json({ players: result, total: Number(total), limit, offset });
});

router.get("/admin/players/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, id));
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  const [gamesCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(gamesTable).where(eq(gamesTable.playerId, id));
  const recentGames = await db.select().from(gamesTable).where(eq(gamesTable.playerId, id)).orderBy(desc(gamesTable.createdAt)).limit(10);
  const recentTx = await db.select().from(transactionsTable).where(eq(transactionsTable.playerId, id)).orderBy(desc(transactionsTable.createdAt)).limit(20);
  const [depositTotal] = await db.select({ total: sql<number>`COALESCE(SUM(amount_striker),0)` }).from(transactionsTable).where(and(eq(transactionsTable.playerId, id), eq(transactionsTable.type, "deposit")));
  const [withdrawTotal] = await db.select({ total: sql<number>`COALESCE(SUM(amount_striker),0)` }).from(transactionsTable).where(and(eq(transactionsTable.playerId, id), eq(transactionsTable.type, "withdrawal")));

  res.json({
    id: player.id,
    telegramId: player.telegramId,
    username: player.username,
    firstName: player.firstName,
    lastName: player.lastName,
    strikerBalance: player.strikerBalance,
    bootBalance: player.bootBalance,
    captainBalance: player.captainBalance,
    vipTier: player.vipTier,
    tonWageredLifetime: player.tonWageredLifetime,
    streakDays: player.streakDays,
    isBanned: player.isBanned,
    isFlagged: player.isFlagged,
    banReason: player.banReason ?? null,
    firstWithdrawalReviewed: player.firstWithdrawalReviewed,
    totalGames: Number(gamesCount?.count ?? 0),
    totalDepositedStriker: Number(depositTotal?.total ?? 0),
    totalWithdrawnStriker: Number(withdrawTotal?.total ?? 0),
    referralCode: player.referralCode,
    referredBy: player.referredBy ?? null,
    deviceFingerprint: player.deviceFingerprint ?? null,
    lastActive: player.lastActive?.toISOString() ?? null,
    createdAt: player.createdAt.toISOString(),
    recentGames: recentGames.map(g => ({
      id: g.id,
      gameType: g.gameType,
      betStriker: g.betStriker,
      winAmount: g.winAmount,
      outcome: g.outcome,
      createdAt: g.createdAt.toISOString(),
    })),
    recentTransactions: recentTx.map(t => ({
      id: t.id,
      type: t.type,
      amountStriker: t.amountStriker,
      amountTon: t.amountTon,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
    })),
  });
});

router.patch("/admin/players/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const { isBanned, isFlagged, strikerBalance, bootBalance, captainBalance, vipTier, banReason } = req.body as {
    isBanned?: boolean; isFlagged?: boolean; strikerBalance?: number; bootBalance?: number;
    captainBalance?: number; vipTier?: string; banReason?: string;
  };

  const updates: Partial<typeof playersTable.$inferInsert> = {};
  if (isBanned !== undefined) updates.isBanned = isBanned;
  if (isFlagged !== undefined) updates.isFlagged = isFlagged;
  if (strikerBalance !== undefined) updates.strikerBalance = strikerBalance;
  if (bootBalance !== undefined) updates.bootBalance = bootBalance;
  if (captainBalance !== undefined) updates.captainBalance = captainBalance;
  if (vipTier !== undefined) updates.vipTier = vipTier;
  if (banReason !== undefined) updates.banReason = banReason;

  await db.update(playersTable).set(updates).where(eq(playersTable.id, id));

  await db.insert(auditLogTable).values({
    adminAction: "update_player",
    targetPlayerId: id,
    newValue: JSON.stringify(updates),
    performedBy: "admin",
  });

  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, id));
  res.json({ id: player.id, username: player.username, strikerBalance: player.strikerBalance, bootBalance: player.bootBalance, captainBalance: player.captainBalance, vipTier: player.vipTier, isBanned: player.isBanned, isFlagged: player.isFlagged, banReason: player.banReason ?? null });
});

router.post("/admin/players/:id/adjust-balance", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const { delta, currency, reason } = req.body as { delta: number; currency: "striker" | "boot" | "captain"; reason: string };
  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, id));
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  const field = currency === "striker" ? "strikerBalance" : currency === "boot" ? "bootBalance" : "captainBalance";
  const current = currency === "striker" ? player.strikerBalance : currency === "boot" ? player.bootBalance : player.captainBalance;
  const newBalance = Math.max(0, current + delta);

  await db.update(playersTable).set({ [field]: newBalance }).where(eq(playersTable.id, id));
  await db.insert(auditLogTable).values({ adminAction: "adjust_balance", targetPlayerId: id, newValue: JSON.stringify({ currency, delta, reason, newBalance }), performedBy: "admin" });

  res.json({ id, currency, previousBalance: current, newBalance, delta });
});

// ── WITHDRAWALS ──────────────────────────────────────────────────────────────

router.get("/admin/withdrawals", requireAdmin, async (req, res): Promise<void> => {
  const statusFilter = String(req.query.status ?? "under_review");
  const limit = Math.min(parseInt(String(req.query.limit ?? 50)), 200);
  const offset = parseInt(String(req.query.offset ?? 0));

  const withdrawals = await db.select().from(withdrawalsTable)
    .where(statusFilter === "all" ? undefined : eq(withdrawalsTable.status, statusFilter))
    .orderBy(desc(withdrawalsTable.createdAt)).limit(limit).offset(offset);

  const [{ count: total }] = await db.select({ count: sql<number>`COUNT(*)` }).from(withdrawalsTable)
    .where(statusFilter === "all" ? undefined : eq(withdrawalsTable.status, statusFilter));

  const result = await Promise.all(
    withdrawals.map(async (w) => {
      const [player] = await db.select().from(playersTable).where(eq(playersTable.id, w.playerId));
      return {
        id: w.id, playerId: w.playerId,
        username: player?.username ?? "Unknown",
        vipTier: player?.vipTier ?? "sunday_league",
        amountStriker: w.amountStriker, amountTon: w.amountTon,
        destinationAddress: w.destinationAddress, currency: w.currency,
        status: w.status, reviewedBy: w.reviewedBy ?? null,
        createdAt: w.createdAt.toISOString(),
      };
    })
  );

  res.json({ withdrawals: result, total: Number(total), limit, offset });
});

router.post("/admin/withdrawals/:id/approve", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const [withdrawal] = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.id, id));
  if (!withdrawal) { res.status(404).json({ error: "Withdrawal not found" }); return; }
  if (withdrawal.status !== "under_review") {
    res.status(400).json({ error: `Withdrawal is already ${withdrawal.status}` }); return;
  }

  await db.update(withdrawalsTable).set({ status: "approved", reviewedBy: "admin" }).where(eq(withdrawalsTable.id, id));
  await db.update(playersTable).set({ firstWithdrawalReviewed: true }).where(eq(playersTable.id, withdrawal.playerId));
  await db.insert(auditLogTable).values({ adminAction: "approve_withdrawal", targetPlayerId: withdrawal.playerId, newValue: `${withdrawal.amountTon} TON`, performedBy: "admin" });

  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, withdrawal.playerId));

  // Trigger actual CryptoBot payout now that review is done
  if (player) {
    processCryptoBotTransfer(
      withdrawal.id,
      Number(player.telegramId),
      withdrawal.amountTon,
      withdrawal.destinationAddress,
      player.username,
    ).catch((err) => logger.error({ err }, "CryptoBot transfer failed after admin approval"));
  }

  res.json({ id: withdrawal.id, status: "approved", username: player?.username ?? "Unknown", amountTon: withdrawal.amountTon, destinationAddress: withdrawal.destinationAddress });
});

router.post("/admin/withdrawals/:id/reject", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const [withdrawal] = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.id, id));
  if (!withdrawal) { res.status(404).json({ error: "Withdrawal not found" }); return; }
  if (withdrawal.status !== "under_review") {
    res.status(400).json({ error: `Withdrawal is already ${withdrawal.status}` }); return;
  }

  await db.update(withdrawalsTable).set({ status: "rejected", reviewedBy: "admin" }).where(eq(withdrawalsTable.id, id));
  // Atomic refund — no stale-read race
  await db.update(playersTable)
    .set({ strikerBalance: sql`${playersTable.strikerBalance} + ${withdrawal.amountStriker}` })
    .where(eq(playersTable.id, withdrawal.playerId));
  await db.insert(auditLogTable).values({ adminAction: "reject_withdrawal", targetPlayerId: withdrawal.playerId, newValue: `${withdrawal.amountTon} TON refunded`, performedBy: "admin" });
  res.json({ id: withdrawal.id, status: "rejected", amountStriker: withdrawal.amountStriker, note: "Balance refunded" });
});

// ── CONFIG ───────────────────────────────────────────────────────────────────

router.get("/admin/config", requireAdmin, async (_req, res): Promise<void> => {
  const all = await getAllConfig();
  const masked = all.map(c => ({
    ...c,
    value: c.isSecret && c.value ? "••••••••" : c.value,
    rawValue: undefined,
  }));
  res.json(masked);
});

router.get("/admin/config/raw", requireAdmin, async (_req, res): Promise<void> => {
  const all = await getAllConfig();
  res.json(all);
});

router.put("/admin/config/:key", requireAdmin, async (req, res): Promise<void> => {
  const key = String(req.params.key);
  const { value } = req.body as { value: string };
  if (value === undefined) { res.status(400).json({ error: "value required" }); return; }
  if (value === "••••••••") { res.json({ ok: true, note: "Masked value unchanged" }); return; }

  await setConfig(key, String(value));
  await db.insert(auditLogTable).values({ adminAction: "update_config", targetPlayerId: null, newValue: JSON.stringify({ key, value: (await getAllConfig()).find(c => c.key === key)?.isSecret ? "[REDACTED]" : value }), performedBy: "admin" });

  res.json({ ok: true, key, updated: true });
});

async function handleBulkConfigUpdate(req: import("express").Request, res: import("express").Response): Promise<void> {
  const updates = req.body as Record<string, string>;
  for (const [key, value] of Object.entries(updates)) {
    if (value === "••••••••") continue;
    await setConfig(key, String(value));
  }
  await db.insert(auditLogTable).values({ adminAction: "bulk_config_update", targetPlayerId: null, newValue: JSON.stringify(Object.keys(updates)), performedBy: "admin" });
  res.json({ ok: true, updated: Object.keys(updates).length });
}

router.put("/admin/config", requireAdmin, handleBulkConfigUpdate);
router.patch("/admin/config", requireAdmin, handleBulkConfigUpdate);

// ── ANALYTICS ────────────────────────────────────────────────────────────────

router.get("/admin/analytics", requireAdmin, async (req, res): Promise<void> => {
  const days = Math.min(parseInt(String(req.query.days ?? 7)), 90);
  const since = new Date();
  since.setDate(since.getDate() - days);

  const depositRate = await getConfigFloat("striker_deposit_rate", 100);

  const dailyRevenue = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);

    const dayGames = await db.select({ betStriker: gamesTable.betStriker, gameType: gamesTable.gameType }).from(gamesTable).where(and(gte(gamesTable.createdAt, date), lt(gamesTable.createdAt, nextDate)));
    const volume = dayGames.reduce((s, g) => s + g.betStriker / depositRate, 0);
    const revenue = volume * 0.04;

    const [newPlayers] = await db.select({ count: sql<number>`COUNT(*)` }).from(playersTable).where(and(gte(playersTable.createdAt, date), lt(playersTable.createdAt, nextDate)));
    const [dayTx] = await db.select({ count: sql<number>`COUNT(*)` }).from(gamesTable).where(and(gte(gamesTable.createdAt, date), lt(gamesTable.createdAt, nextDate)));

    dailyRevenue.push({
      date: date.toISOString().split("T")[0],
      revenue: parseFloat(revenue.toFixed(4)),
      volume: parseFloat(volume.toFixed(4)),
      newPlayers: Number(newPlayers?.count ?? 0),
      games: Number(dayTx?.count ?? 0),
    });
  }

  const gameTypes = ["shot", "penalty", "minefield", "freekick"];
  const gameBreakdown: Record<string, { count: number; volume: number }> = {};
  for (const gt of gameTypes) {
    const rows = await db.select({ betStriker: gamesTable.betStriker }).from(gamesTable).where(and(eq(gamesTable.gameType, gt), gte(gamesTable.createdAt, since)));
    gameBreakdown[gt] = { count: rows.length, volume: parseFloat((rows.reduce((s, r) => s + r.betStriker / depositRate, 0)).toFixed(4)) };
  }

  const vipTiers = ["amateur", "division_one", "premier_league", "champions_league", "world_cup"];
  const vipDistribution: Record<string, number> = {};
  for (const tier of vipTiers) {
    const [count] = await db.select({ count: sql<number>`COUNT(*)` }).from(playersTable).where(eq(playersTable.vipTier, tier));
    vipDistribution[tier] = Number(count?.count ?? 0);
  }

  const totalRevenue = dailyRevenue.reduce((s, d) => s + d.revenue, 0);
  const totalVolume = dailyRevenue.reduce((s, d) => s + d.volume, 0);
  const [newPlayersTotal] = await db.select({ count: sql<number>`COUNT(*)` }).from(playersTable).where(gte(playersTable.createdAt, since));

  const topPlayers = await db.select({ id: playersTable.id, username: playersTable.username, tonWageredLifetime: playersTable.tonWageredLifetime, vipTier: playersTable.vipTier }).from(playersTable).orderBy(desc(playersTable.tonWageredLifetime)).limit(10);

  res.json({
    days, dailyRevenue,
    totalRevenue: parseFloat(totalRevenue.toFixed(4)),
    totalVolume: parseFloat(totalVolume.toFixed(4)),
    playerGrowth: Number(newPlayersTotal?.count ?? 0),
    gameBreakdown, vipDistribution,
    topPlayers,
    revenueBreakdown: {
      houseEdge: parseFloat(totalRevenue.toFixed(4)),
      spread: parseFloat((totalVolume * 0.01).toFixed(4)),
      jackpotHouseCut: 0,
      tournamentRake: 0,
    },
  });
});

// ── AUDIT LOG ────────────────────────────────────────────────────────────────

router.get("/admin/audit-log", requireAdmin, async (req, res): Promise<void> => {
  const limit = Math.min(parseInt(String(req.query.limit ?? 50)), 200);
  const offset = parseInt(String(req.query.offset ?? 0));

  const logs = await db.select().from(auditLogTable).orderBy(desc(auditLogTable.createdAt)).limit(limit).offset(offset);
  const [{ count: total }] = await db.select({ count: sql<number>`COUNT(*)` }).from(auditLogTable);

  const result = await Promise.all(logs.map(async l => {
    let username: string | null = null;
    if (l.targetPlayerId) {
      const [p] = await db.select({ username: playersTable.username }).from(playersTable).where(eq(playersTable.id, l.targetPlayerId));
      username = p?.username ?? null;
    }
    return { id: l.id, action: l.adminAction, targetPlayerId: l.targetPlayerId, targetUsername: username, value: l.newValue, performedBy: l.performedBy, createdAt: l.createdAt.toISOString() };
  }));

  res.json({ logs: result, total: Number(total), limit, offset });
});

// ── BROADCAST ────────────────────────────────────────────────────────────────

router.post("/admin/broadcast", requireAdmin, async (req, res): Promise<void> => {
  const { message, buttonText, buttonUrl } = req.body as { message: string; buttonText?: string; buttonUrl?: string };
  if (!message) { res.status(400).json({ error: "Message required" }); return; }
  await broadcastMessage(message, buttonText, buttonUrl);
  await db.insert(auditLogTable).values({ adminAction: "broadcast", targetPlayerId: null, newValue: message.slice(0, 200), performedBy: "admin" });
  res.json({ ok: true });
});

// ── JACKPOT ──────────────────────────────────────────────────────────────────

router.post("/admin/jackpot/seed", requireAdmin, async (req, res): Promise<void> => {
  const { amountTon } = req.body as { amountTon: number };
  if (!amountTon || amountTon <= 0) { res.status(400).json({ error: "Invalid amount" }); return; }

  const [jackpot] = await db.select().from(jackpotTable).limit(1);
  const minPool = await getConfigFloat("jackpot_min_pool", 50);

  if (jackpot) {
    const newAmount = jackpot.currentAmountTon + amountTon;
    await db.update(jackpotTable).set({ currentAmountTon: newAmount, status: newAmount >= minPool ? "ready" : "building" }).where(eq(jackpotTable.id, jackpot.id));
    res.json({ currentAmountTon: newAmount, minimumTrigger: minPool, status: newAmount >= minPool ? "ready" : "building", lastWinner: jackpot.lastWinnerUsername ?? null, percentFull: Math.min(100, (newAmount / minPool) * 100) });
  } else {
    const [j] = await db.insert(jackpotTable).values({ currentAmountTon: amountTon, status: "building" }).returning();
    res.json({ currentAmountTon: j.currentAmountTon, minimumTrigger: minPool, status: j.status, lastWinner: null, percentFull: Math.min(100, (j.currentAmountTon / minPool) * 100) });
  }
  await db.insert(auditLogTable).values({ adminAction: "jackpot_seed", targetPlayerId: null, newValue: `${amountTon} TON`, performedBy: "admin" });
});

// ── TOURNAMENTS ──────────────────────────────────────────────────────────────

router.get("/admin/tournaments", requireAdmin, async (_req, res): Promise<void> => {
  const tournaments = await db.select().from(tournamentsTable).orderBy(desc(tournamentsTable.startTime)).limit(20);
  res.json(tournaments.map(t => ({
    id: t.id, type: t.type, prizePoolTon: t.prizePoolTon, status: t.status,
    startTime: t.startTime.toISOString(), endTime: t.endTime.toISOString(),
    entryFeeBoots: t.entryFeeBoots ?? null,
  })));
});

router.post("/admin/tournaments", requireAdmin, async (req, res): Promise<void> => {
  const { type, prizePoolTon, durationHours, entryFeeBoots } = req.body as { type: string; prizePoolTon: number; durationHours: number; entryFeeBoots?: number };
  const startTime = new Date();
  const endTime = new Date(startTime.getTime() + durationHours * 3600000);
  const [t] = await db.insert(tournamentsTable).values({ type, prizePoolTon, entryFeeBoots: entryFeeBoots ?? null, status: "active", startTime, endTime }).returning();
  await db.insert(auditLogTable).values({ adminAction: "create_tournament", targetPlayerId: null, newValue: JSON.stringify({ type, prizePoolTon, durationHours }), performedBy: "admin" });
  res.status(201).json({ id: t.id, type: t.type, prizePoolTon: t.prizePoolTon, status: t.status, startTime: t.startTime.toISOString(), endTime: t.endTime.toISOString() });
});

router.post("/admin/tournaments/:id/end", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  await db.update(tournamentsTable).set({ status: "ended" }).where(eq(tournamentsTable.id, id));
  await db.insert(auditLogTable).values({ adminAction: "end_tournament", targetPlayerId: null, newValue: String(id), performedBy: "admin" });
  res.json({ ok: true, id });
});

// ── RATE EVENTS ──────────────────────────────────────────────────────────────

router.get("/admin/rate-events/status", requireAdmin, async (_req, res): Promise<void> => {
  const { setConfig, getConfig } = await import("../lib/configService");
  void setConfig;
  const active        = await getConfig("rate_event_active").catch(() => "false");
  const depositRate   = await getConfig("rate_event_deposit_rate").catch(() => "100");
  const endsAt        = await getConfig("rate_event_ends_at").catch(() => "");
  const now           = Date.now();
  const isExpired     = endsAt ? new Date(endsAt).getTime() < now : false;
  res.json({
    active: active === "true" && !isExpired,
    depositRate: parseFloat(depositRate),
    endsAt: endsAt || null,
    expired: isExpired,
  });
});

router.post("/admin/rate-events/start", requireAdmin, async (req, res): Promise<void> => {
  const { depositRate = 120, durationMinutes = 60 } = req.body as { depositRate?: number; durationMinutes?: number };
  const { setConfig } = await import("../lib/configService");
  const endsAt = new Date(Date.now() + durationMinutes * 60_000).toISOString();
  await setConfig("rate_event_active", "true");
  await setConfig("rate_event_deposit_rate", String(depositRate));
  await setConfig("rate_event_ends_at", endsAt);
  await db.insert(auditLogTable).values({ adminAction: "rate_event_start", targetPlayerId: null, newValue: JSON.stringify({ depositRate, durationMinutes }), performedBy: "admin" });
  res.json({ active: true, depositRate, endsAt });
});

router.post("/admin/rate-events/end", requireAdmin, async (_req, res): Promise<void> => {
  const { setConfig } = await import("../lib/configService");
  await setConfig("rate_event_active", "false");
  await db.insert(auditLogTable).values({ adminAction: "rate_event_end", targetPlayerId: null, newValue: "manual_end", performedBy: "admin" });
  res.json({ ok: true });
});

// ── FLAGGED PLAYERS ───────────────────────────────────────────────────────────

router.get("/admin/flagged", requireAdmin, async (_req, res): Promise<void> => {
  const flagged = await db.select({
    id: playersTable.id, username: playersTable.username,
    strikerBalance: playersTable.strikerBalance, vipTier: playersTable.vipTier,
    isFlagged: playersTable.isFlagged, isBanned: playersTable.isBanned,
    lastActive: playersTable.lastActive, tonWageredLifetime: playersTable.tonWageredLifetime,
  }).from(playersTable).where(eq(playersTable.isFlagged, true)).orderBy(desc(playersTable.lastActive)).limit(50);

  res.json(flagged.map(p => ({
    ...p,
    lastActive: p.lastActive?.toISOString() ?? null,
  })));
});

router.post("/admin/players/:id/flag", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const { flag = true, reason } = req.body as { flag?: boolean; reason?: string };
  await db.update(playersTable).set({ isFlagged: flag }).where(eq(playersTable.id, id));
  await db.insert(auditLogTable).values({ adminAction: flag ? "flag_player" : "unflag_player", targetPlayerId: id, newValue: reason ?? "", performedBy: "admin" });
  res.json({ ok: true, id, isFlagged: flag });
});

// ── MATCH EVENTS ──────────────────────────────────────────────────────────────

router.get("/admin/match-events/status", requireAdmin, async (_req, res): Promise<void> => {
  const active = await getConfig("match_event_active").catch(() => "false");
  const teamA = await getConfig("match_event_team_a").catch(() => "");
  const teamB = await getConfig("match_event_team_b").catch(() => "");
  const bonusMultiplier = await getConfig("match_event_bonus_multiplier").catch(() => "1.0");
  const endsAt = await getConfig("match_event_ends_at").catch(() => "");
  const label = await getConfig("match_event_label").catch(() => "Match Day");
  const now = Date.now();
  const isExpired = endsAt ? new Date(endsAt).getTime() < now : false;
  res.json({
    active: active === "true" && !isExpired,
    teamA,
    teamB,
    bonusMultiplier: parseFloat(bonusMultiplier),
    endsAt: endsAt || null,
    label,
    expired: isExpired,
  });
});

router.post("/admin/match-events/start", requireAdmin, async (req, res): Promise<void> => {
  const { teamA, teamB, bonusMultiplier = 1.5, durationMinutes = 120, label = "Match Day" } = req.body as {
    teamA: string;
    teamB: string;
    bonusMultiplier?: number;
    durationMinutes?: number;
    label?: string;
  };
  if (!teamA || !teamB) {
    res.status(400).json({ error: "teamA and teamB are required" });
    return;
  }
  const endsAt = new Date(Date.now() + durationMinutes * 60_000).toISOString();
  await setConfig("match_event_active", "true");
  await setConfig("match_event_team_a", teamA);
  await setConfig("match_event_team_b", teamB);
  await setConfig("match_event_bonus_multiplier", String(bonusMultiplier));
  await setConfig("match_event_ends_at", endsAt);
  await setConfig("match_event_label", label);
  await db.insert(auditLogTable).values({
    adminAction: "match_event_start",
    targetPlayerId: null,
    newValue: JSON.stringify({ teamA, teamB, bonusMultiplier, durationMinutes }),
    performedBy: "admin",
  });
  logger.info({ teamA, teamB, endsAt }, "Match event started");
  res.json({ active: true, teamA, teamB, bonusMultiplier, endsAt });
});

router.post("/admin/match-events/end", requireAdmin, async (_req, res): Promise<void> => {
  await setConfig("match_event_active", "false");
  await db.insert(auditLogTable).values({ adminAction: "match_event_end", targetPlayerId: null, newValue: "manual_end", performedBy: "admin" });
  res.json({ ok: true });
});

// ── PLAYER INBOX (Admin DM via GameBot) ───────────────────────────────────────

router.post("/admin/players/:id/inbox", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const { message } = req.body as { message: string };
  if (!message || message.trim().length === 0) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, id));
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  try {
    const { getGameBot } = await import("../lib/gameBot");
    const bot = getGameBot();
    if (!bot) {
      res.status(503).json({ error: "GameBot not initialized" });
      return;
    }
    await bot.telegram.sendMessage(
      player.telegramId,
      `📬 *Message from StrikerX Team*\n\n${message}`,
      { parse_mode: "Markdown" },
    );
    await db.insert(auditLogTable).values({
      adminAction: "player_inbox_message",
      targetPlayerId: id,
      newValue: message.slice(0, 200),
      performedBy: "admin",
    });
    logger.info({ playerId: id, username: player.username }, "Admin inbox DM sent");
    res.json({ ok: true, deliveredTo: player.username });
  } catch (err) {
    logger.error({ err, playerId: id }, "Failed to send inbox DM");
    res.status(502).json({ error: "Failed to deliver message — player may have blocked the bot" });
  }
});

// ── INBOX LOG ─────────────────────────────────────────────────────────────────

router.get("/admin/inbox", requireAdmin, async (req, res): Promise<void> => {
  const limit = Math.min(200, parseInt(String(req.query.limit ?? 100), 10));

  const entries = await db
    .select({
      id: auditLogTable.id,
      targetPlayerId: auditLogTable.targetPlayerId,
      newValue: auditLogTable.newValue,
      performedBy: auditLogTable.performedBy,
      createdAt: auditLogTable.createdAt,
      username: playersTable.username,
    })
    .from(auditLogTable)
    .leftJoin(playersTable, eq(auditLogTable.targetPlayerId, playersTable.id))
    .where(eq(auditLogTable.adminAction, "player_inbox_message"))
    .orderBy(desc(auditLogTable.createdAt))
    .limit(limit);

  res.json(
    entries.map(e => ({
      id: e.id,
      playerId: e.targetPlayerId,
      username: e.username ?? null,
      message: e.newValue ?? null,
      sentBy: e.performedBy ?? null,
      sentAt: e.createdAt?.toISOString() ?? null,
    })),
  );
});

// ── ANALYTICS EXPORT (CSV) ────────────────────────────────────────────────────

router.get("/admin/analytics/export", requireAdmin, async (req, res): Promise<void> => {
  const { type = "players", days = "30" } = req.query as { type?: string; days?: string };
  const since = new Date(Date.now() - parseInt(days, 10) * 86400000);

  try {
    if (type === "players") {
      const rows = await db
        .select({
          id: playersTable.id,
          telegramId: playersTable.telegramId,
          username: playersTable.username,
          vipTier: playersTable.vipTier,
          strikerBalance: playersTable.strikerBalance,
          tonWageredLifetime: playersTable.tonWageredLifetime,
          kycStatus: playersTable.kycStatus,
          isBanned: playersTable.isBanned,
          isFlagged: playersTable.isFlagged,
          referralCode: playersTable.referralCode,
          createdAt: playersTable.createdAt,
        })
        .from(playersTable)
        .where(gte(playersTable.createdAt, since))
        .orderBy(desc(playersTable.createdAt))
        .limit(10000);

      const headers = "id,telegramId,username,vipTier,strikerBalance,tonWageredLifetime,kycStatus,isBanned,isFlagged,referralCode,createdAt";
      const csv = [
        headers,
        ...rows.map(r =>
          [r.id, r.telegramId, `"${r.username}"`, r.vipTier, r.strikerBalance, r.tonWageredLifetime, r.kycStatus, r.isBanned, r.isFlagged, r.referralCode, r.createdAt?.toISOString()].join(","),
        ),
      ].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="strikerx_players_${days}d.csv"`);
      res.send(csv);
    } else if (type === "transactions") {
      const rows = await db
        .select()
        .from(transactionsTable)
        .where(gte(transactionsTable.createdAt, since))
        .orderBy(desc(transactionsTable.createdAt))
        .limit(50000);

      const headers = "id,playerId,type,amountStriker,amountTon,currency,status,createdAt";
      const csv = [
        headers,
        ...rows.map(r =>
          [r.id, r.playerId, r.type, r.amountStriker, r.amountTon ?? "", r.currency ?? "", r.status, r.createdAt?.toISOString()].join(","),
        ),
      ].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="strikerx_transactions_${days}d.csv"`);
      res.send(csv);
    } else {
      res.status(400).json({ error: "type must be players or transactions" });
    }
  } catch (err) {
    logger.error({ err }, "Analytics export failed");
    res.status(500).json({ error: "Export failed" });
  }
});

export default router;
