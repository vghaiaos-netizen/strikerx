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
    // Top players by lifetime TON wagered
    const players = await db.select({
      id: playersTable.id,
      username: playersTable.username,
      vipTier: playersTable.vipTier,
      tonWageredLifetime: playersTable.tonWageredLifetime,
    }).from(playersTable)
      .orderBy(desc(playersTable.tonWageredLifetime))
      .limit(limit);

    entries = await Promise.all(players.map(async (p, i) => {
      const [gc] = await db.select({ count: sql<number>`COUNT(*)` }).from(gamesTable).where(eq(gamesTable.playerId, p.id));
      return {
        rank: i + 1,
        playerId: p.id,
        username: p.username,
        vipTier: p.vipTier,
        score: p.tonWageredLifetime,
        gamesPlayed: Number(gc?.count ?? 0),
      };
    }));
  } else if (type === "wins") {
    // Top players by total STRIKER won
    const since = new Date(0);
    const results = await db.select({
      playerId: gamesTable.playerId,
      totalWins: sql<number>`SUM(${gamesTable.winAmount})`,
      gamesPlayed: sql<number>`COUNT(*)`,
    }).from(gamesTable)
      .groupBy(gamesTable.playerId)
      .orderBy(desc(sql<number>`SUM(${gamesTable.winAmount})`))
      .limit(limit);

    entries = await Promise.all(results.map(async (r, i) => {
      const [player] = await db.select({ username: playersTable.username, vipTier: playersTable.vipTier }).from(playersTable).where(eq(playersTable.id, r.playerId));
      return {
        rank: i + 1,
        playerId: r.playerId,
        username: player?.username ?? "Unknown",
        vipTier: player?.vipTier ?? "sunday_league",
        score: Math.round(r.totalWins ?? 0),
        gamesPlayed: Number(r.gamesPlayed ?? 0),
      };
    }));
  } else if (type === "streak") {
    // Top players by streak days
    const players = await db.select({
      id: playersTable.id,
      username: playersTable.username,
      vipTier: playersTable.vipTier,
      streakDays: playersTable.streakDays,
    }).from(playersTable)
      .orderBy(desc(playersTable.streakDays))
      .limit(limit);

    entries = players.map((p, i) => ({
      rank: i + 1,
      playerId: p.id,
      username: p.username,
      vipTier: p.vipTier,
      score: p.streakDays,
    }));
  } else if (type === "referrals") {
    // Top players by referral count (count players who have referredBy matching this player's referralCode)
    const allPlayers = await db.select({
      id: playersTable.id,
      username: playersTable.username,
      vipTier: playersTable.vipTier,
      referralCode: playersTable.referralCode,
    }).from(playersTable);

    const referralCounts: Array<{ playerId: number; username: string; vipTier: string; count: number }> = [];

    for (const p of allPlayers) {
      const [rc] = await db.select({ count: sql<number>`COUNT(*)` }).from(playersTable).where(eq(playersTable.referredBy, p.referralCode));
      if (Number(rc?.count ?? 0) > 0) {
        referralCounts.push({ playerId: p.id, username: p.username, vipTier: p.vipTier, count: Number(rc?.count ?? 0) });
      }
    }

    referralCounts.sort((a, b) => b.count - a.count);
    entries = referralCounts.slice(0, limit).map((r, i) => ({
      rank: i + 1,
      playerId: r.playerId,
      username: r.username,
      vipTier: r.vipTier,
      score: r.count,
    }));
  } else {
    // Legacy: daily/weekly/alltime by best multiplier
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

    const results = await db.select({
      playerId: gamesTable.playerId,
      bestMultiplier: sql<number>`MAX(${gamesTable.resultMultiplier})`,
    }).from(gamesTable)
      .where(gte(gamesTable.createdAt, sinceDate))
      .groupBy(gamesTable.playerId)
      .orderBy(desc(sql<number>`MAX(${gamesTable.resultMultiplier})`))
      .limit(limit);

    entries = await Promise.all(results.map(async (r, i) => {
      const [player] = await db.select().from(playersTable).where(eq(playersTable.id, r.playerId));
      return {
        rank: i + 1,
        playerId: r.playerId,
        username: player?.username ?? "Unknown",
        vipTier: player?.vipTier ?? "sunday_league",
        score: r.bestMultiplier,
      };
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

  const entries = await db
    .select()
    .from(tournamentEntriesTable)
    .where(eq(tournamentEntriesTable.tournamentId, tournament.id))
    .orderBy(desc(tournamentEntriesTable.bestMultiplier))
    .limit(10);

  const topEntries = await Promise.all(
    entries.map(async (e, idx) => {
      const [player] = await db.select().from(playersTable).where(eq(playersTable.id, e.playerId));
      return {
        rank: idx + 1,
        playerId: e.playerId,
        username: player?.username ?? "Unknown",
        value: e.bestMultiplier,
        vipTier: player?.vipTier ?? "sunday_league",
        captainBalance: player?.captainBalance ?? 0,
      };
    })
  );

  res.json({
    id: tournament.id,
    type: tournament.type,
    prizePoolTon: tournament.prizePoolTon,
    status: tournament.status,
    startTime: tournament.startTime.toISOString(),
    endTime: tournament.endTime.toISOString(),
    entryFeeBoots: tournament.entryFeeBoots ?? null,
    topEntries,
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
      const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
      if (!player || player.bootBalance < tournament.entryFeeBoots) {
        res.status(400).json({ error: "Insufficient BOOT balance for entry fee" });
        return;
      }
      await db.update(playersTable).set({ bootBalance: player.bootBalance - tournament.entryFeeBoots }).where(eq(playersTable.id, playerId));
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

  const entries = await db
    .select()
    .from(tournamentEntriesTable)
    .where(eq(tournamentEntriesTable.tournamentId, tournamentId))
    .orderBy(desc(tournamentEntriesTable.bestMultiplier))
    .limit(50);

  const prizeDistribution = [0.5, 0.25, 0.15, 0.07, 0.03];

  const leaderboard = await Promise.all(
    entries.map(async (e, idx) => {
      const [player] = await db.select().from(playersTable).where(eq(playersTable.id, e.playerId));
      const prizeFraction = prizeDistribution[idx] ?? 0;
      return {
        rank: idx + 1,
        playerId: e.playerId,
        username: player?.username ?? "Unknown",
        score: e.bestMultiplier,
        prize: parseFloat((tournament.prizePoolTon * prizeFraction).toFixed(4)),
      };
    })
  );

  res.json(leaderboard);
});

export default router;
