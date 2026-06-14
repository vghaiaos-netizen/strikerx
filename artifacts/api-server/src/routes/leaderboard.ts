import { Router, type IRouter } from "express";
import { db, playersTable, gamesTable, tournamentsTable, tournamentEntriesTable } from "@workspace/db";
import { desc, eq, gte, sql, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

// GET /leaderboard
router.get("/leaderboard", async (req, res): Promise<void> => {
  const type = String(req.query.type ?? "wagered");
  const limit = Math.min(parseInt(String(req.query.limit ?? 50)), 100);

  let entries: Array<{ rank: number; playerId: number; username: string; vipTier: string; score: number; gamesPlayed?: number }> = [];

  if (type === "wagered") {
    // Top players by lifetime TON wagered — single JOIN avoids N+1 COUNT queries
    const results = await db
      .select({
        id: playersTable.id,
        username: playersTable.username,
        vipTier: playersTable.vipTier,
        tonWageredLifetime: playersTable.tonWageredLifetime,
        gamesPlayed: sql<number>`COALESCE(COUNT(${gamesTable.id}), 0)`,
      })
      .from(playersTable)
      .leftJoin(gamesTable, eq(gamesTable.playerId, playersTable.id))
      .groupBy(playersTable.id, playersTable.username, playersTable.vipTier, playersTable.tonWageredLifetime)
      .orderBy(desc(playersTable.tonWageredLifetime))
      .limit(limit);

    entries = results.map((p, i) => ({
      rank: i + 1,
      playerId: p.id,
      username: p.username,
      vipTier: p.vipTier,
      score: p.tonWageredLifetime,
      gamesPlayed: Number(p.gamesPlayed ?? 0),
    }));
  } else if (type === "wins") {
    // Top players by total STRIKER won — JOIN avoids N+1 player lookups
    const results = await db
      .select({
        playerId: gamesTable.playerId,
        username: playersTable.username,
        vipTier: playersTable.vipTier,
        totalWins: sql<number>`SUM(${gamesTable.winAmount})`,
        gamesPlayed: sql<number>`COUNT(*)`,
      })
      .from(gamesTable)
      .innerJoin(playersTable, eq(playersTable.id, gamesTable.playerId))
      .groupBy(gamesTable.playerId, playersTable.username, playersTable.vipTier)
      .orderBy(desc(sql<number>`SUM(${gamesTable.winAmount})`))
      .limit(limit);

    entries = results.map((r, i) => ({
      rank: i + 1,
      playerId: r.playerId,
      username: r.username ?? "Unknown",
      vipTier: r.vipTier ?? "amateur",
      score: Math.round(Number(r.totalWins ?? 0)),
      gamesPlayed: Number(r.gamesPlayed ?? 0),
    }));
  } else if (type === "streak") {
    // Top players by streak days — no JOIN needed, data lives on player row
    const results = await db
      .select({
        id: playersTable.id,
        username: playersTable.username,
        vipTier: playersTable.vipTier,
        streakDays: playersTable.streakDays,
      })
      .from(playersTable)
      .orderBy(desc(playersTable.streakDays))
      .limit(limit);

    entries = results.map((p, i) => ({
      rank: i + 1,
      playerId: p.id,
      username: p.username,
      vipTier: p.vipTier,
      score: p.streakDays,
    }));
  } else if (type === "referrals") {
    // Top referrers — self-join via raw SQL (Drizzle alias not available in this version)
    const rows = await db.execute<{ owner_id: number; username: string; vip_tier: string; referral_count: string }>(
      sql`SELECT owner.id AS owner_id, owner.username, owner.vip_tier, COUNT(referred.id)::int AS referral_count
          FROM players owner
          INNER JOIN players referred ON referred.referred_by = owner.referral_code
          GROUP BY owner.id, owner.username, owner.vip_tier
          ORDER BY COUNT(referred.id) DESC
          LIMIT ${limit}`
    );

    entries = rows.rows.map((r, i) => ({
      rank: i + 1,
      playerId: r.owner_id,
      username: r.username,
      vipTier: r.vip_tier,
      score: Number(r.referral_count),
    }));
  } else {
    // daily / weekly / alltime by best multiplier — JOIN avoids N+1 player lookups
    let sinceDate = new Date();
    if (type === "daily") {
      sinceDate.setHours(0, 0, 0, 0);
    } else if (type === "weekly") {
      const day = sinceDate.getDay();
      sinceDate.setDate(sinceDate.getDate() - day);
      sinceDate.setHours(0, 0, 0, 0);
    } else {
      sinceDate = new Date(0);
    }

    const results = await db
      .select({
        playerId: gamesTable.playerId,
        username: playersTable.username,
        vipTier: playersTable.vipTier,
        bestMultiplier: sql<number>`MAX(${gamesTable.resultMultiplier})`,
      })
      .from(gamesTable)
      .innerJoin(playersTable, eq(playersTable.id, gamesTable.playerId))
      .where(gte(gamesTable.createdAt, sinceDate))
      .groupBy(gamesTable.playerId, playersTable.username, playersTable.vipTier)
      .orderBy(desc(sql<number>`MAX(${gamesTable.resultMultiplier})`))
      .limit(limit);

    entries = results.map((r, i) => ({
      rank: i + 1,
      playerId: r.playerId,
      username: r.username ?? "Unknown",
      vipTier: r.vipTier ?? "amateur",
      score: r.bestMultiplier,
    }));
  }

  res.json({ entries, type, count: entries.length });
});

// GET /tournaments/active
router.get("/tournaments/active", async (_req, res): Promise<void> => {
  const [tournament] = await db
    .select()
    .from(tournamentsTable)
    .where(eq(tournamentsTable.status, "active"))
    .limit(1);

  if (!tournament) {
    res.json(null);
    return;
  }

  // JOIN avoids N+1 player lookups for top-10 entries
  const topEntries = await db
    .select({
      playerId: tournamentEntriesTable.playerId,
      username: playersTable.username,
      vipTier: playersTable.vipTier,
      captainBalance: playersTable.captainBalance,
      bestMultiplier: tournamentEntriesTable.bestMultiplier,
    })
    .from(tournamentEntriesTable)
    .innerJoin(playersTable, eq(playersTable.id, tournamentEntriesTable.playerId))
    .where(eq(tournamentEntriesTable.tournamentId, tournament.id))
    .orderBy(desc(tournamentEntriesTable.bestMultiplier))
    .limit(10);

  res.json({
    id: tournament.id,
    type: tournament.type,
    prizePoolTon: tournament.prizePoolTon,
    status: tournament.status,
    startTime: tournament.startTime.toISOString(),
    endTime: tournament.endTime.toISOString(),
    entryFeeBoots: tournament.entryFeeBoots ?? null,
    topEntries: topEntries.map((e, idx) => ({
      rank: idx + 1,
      playerId: e.playerId,
      username: e.username ?? "Unknown",
      value: e.bestMultiplier,
      vipTier: e.vipTier ?? "amateur",
      captainBalance: e.captainBalance ?? 0,
    })),
  });
});

// POST /tournaments/:id/enter
router.post("/tournaments/:id/enter", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tournamentId = parseInt(raw, 10);

  const [tournament] = await db
    .select()
    .from(tournamentsTable)
    .where(eq(tournamentsTable.id, tournamentId));

  if (!tournament || tournament.status !== "active") {
    res.status(404).json({ error: "Tournament not found or not active" });
    return;
  }

  const [existing] = await db
    .select()
    .from(tournamentEntriesTable)
    .where(and(eq(tournamentEntriesTable.tournamentId, tournamentId), eq(tournamentEntriesTable.playerId, playerId)));

  if (!existing) {
    if (tournament.entryFeeBoots && tournament.entryFeeBoots > 0) {
      // Atomic deduction — prevents double-spend race on tournament entry fee
      const [deducted] = await db
        .update(playersTable)
        .set({ bootBalance: sql`${playersTable.bootBalance} - ${tournament.entryFeeBoots}` })
        .where(sql`${playersTable.id} = ${playerId} AND ${playersTable.bootBalance} >= ${tournament.entryFeeBoots}`)
        .returning();
      if (!deducted) {
        res.status(400).json({ error: "Insufficient BOOT balance for entry fee" });
        return;
      }
    }
    await db.insert(tournamentEntriesTable).values({ tournamentId, playerId });
  }

  res.json({
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

// GET /tournaments/:id/leaderboard
router.get("/tournaments/:id/leaderboard", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tournamentId = parseInt(raw, 10);
  if (isNaN(tournamentId)) { res.status(400).json({ error: "Invalid tournament id" }); return; }

  const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, tournamentId));
  if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }

  const prizeDistribution = [0.5, 0.25, 0.15, 0.07, 0.03];

  // JOIN avoids N+1 player lookups for up-to-50 leaderboard entries
  const entries = await db
    .select({
      playerId: tournamentEntriesTable.playerId,
      username: playersTable.username,
      bestMultiplier: tournamentEntriesTable.bestMultiplier,
    })
    .from(tournamentEntriesTable)
    .innerJoin(playersTable, eq(playersTable.id, tournamentEntriesTable.playerId))
    .where(eq(tournamentEntriesTable.tournamentId, tournamentId))
    .orderBy(desc(tournamentEntriesTable.bestMultiplier))
    .limit(50);

  const leaderboard = entries.map((e, idx) => ({
    rank: idx + 1,
    playerId: e.playerId,
    username: e.username ?? "Unknown",
    score: e.bestMultiplier,
    prize: parseFloat((tournament.prizePoolTon * (prizeDistribution[idx] ?? 0)).toFixed(4)),
  }));

  res.json(leaderboard);
});

// GET /leaderboard/trading — top traders by P&L
router.get("/leaderboard/trading", async (req, res): Promise<void> => {
  const { pool: pgPool } = await import("@workspace/db");
  const period = String(req.query.period ?? "week"); // week | month | alltime
  const limit  = Math.min(parseInt(String(req.query.limit ?? 50)), 100);

  const interval = period === "week" ? "7 days" : period === "month" ? "30 days" : null;
  const whereClause = interval ? `AND tp.created_at >= NOW() - '${interval}'::INTERVAL` : "";

  const result = await pgPool.query(`
    SELECT
      p.id                                  AS player_id,
      p.username,
      p.vip_tier,
      COUNT(tp.id)::int                     AS total_trades,
      SUM(CASE WHEN tp.outcome='win' THEN 1 ELSE 0 END)::int AS wins,
      SUM(CASE WHEN tp.outcome='win'  THEN (tp.win_amount - tp.stake_striker)
               WHEN tp.outcome='loss' THEN -tp.stake_striker
               ELSE 0 END)                 AS net_pnl,
      SUM(tp.stake_striker)                 AS volume
    FROM trading_positions tp
    JOIN players p ON p.id = tp.player_id
    WHERE tp.outcome != 'pending' ${whereClause}
    GROUP BY p.id, p.username, p.vip_tier
    HAVING COUNT(tp.id) >= 3
    ORDER BY net_pnl DESC
    LIMIT $1
  `, [limit]);

  const entries = result.rows.map((r: Record<string, unknown>, i: number) => ({
    rank:        i + 1,
    playerId:    r.player_id,
    username:    r.username,
    vipTier:     r.vip_tier,
    totalTrades: r.total_trades,
    wins:        r.wins,
    winRate:     r.total_trades ? Math.round((Number(r.wins) / Number(r.total_trades)) * 100) : 0,
    netPnl:      parseFloat(String(r.net_pnl ?? 0)),
    volume:      parseFloat(String(r.volume ?? 0)),
  }));

  res.json({ entries, period });
});

export default router;
