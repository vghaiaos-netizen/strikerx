import { Router, type IRouter } from "express";
import { db, playersTable, gamesTable, tournamentsTable, tournamentEntriesTable } from "@workspace/db";
import { desc, eq, gte, sql, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

// GET /leaderboard
router.get("/leaderboard", async (req, res): Promise<void> => {
  const type = String(req.query.type ?? "daily");

  let sinceDate = new Date();
  if (type === "daily") {
    sinceDate.setHours(0, 0, 0, 0);
  } else if (type === "weekly") {
    const day = sinceDate.getDay();
    sinceDate.setDate(sinceDate.getDate() - day);
    sinceDate.setHours(0, 0, 0, 0);
  } else {
    // alltime — all records
    sinceDate = new Date(0);
  }

  // Aggregate best multipliers per player in the period
  const results = await db
    .select({
      playerId: gamesTable.playerId,
      bestMultiplier: sql<number>`MAX(${gamesTable.resultMultiplier})`,
    })
    .from(gamesTable)
    .where(gte(gamesTable.createdAt, sinceDate))
    .groupBy(gamesTable.playerId)
    .orderBy(desc(sql<number>`MAX(${gamesTable.resultMultiplier})`))
    .limit(100);

  // Fetch player details
  const entries = await Promise.all(
    results.slice(0, 50).map(async (r, idx) => {
      const [player] = await db
        .select()
        .from(playersTable)
        .where(eq(playersTable.id, r.playerId));
      return {
        rank: idx + 1,
        playerId: r.playerId,
        username: player?.username ?? "Unknown",
        value: r.bestMultiplier,
        vipTier: player?.vipTier ?? "sunday_league",
        captainBalance: player?.captainBalance ?? 0,
      };
    })
  );

  res.json(entries);
});

// GET /tournaments/active
router.get("/tournaments/active", async (_req, res): Promise<void> => {
  const now = new Date();
  const [tournament] = await db
    .select()
    .from(tournamentsTable)
    .where(eq(tournamentsTable.status, "active"))
    .limit(1);

  if (!tournament) {
    res.json(null);
    return;
  }

  // Get top entries
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

  // Check if already entered
  const [existing] = await db
    .select()
    .from(tournamentEntriesTable)
    .where(
      and(
        eq(tournamentEntriesTable.tournamentId, tournamentId),
        eq(tournamentEntriesTable.playerId, playerId)
      )
    );

  if (!existing) {
    // Deduct boot fee if required
    if (tournament.entryFeeBoots && tournament.entryFeeBoots > 0) {
      const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
      if (!player || player.bootBalance < tournament.entryFeeBoots) {
        res.status(400).json({ error: "Insufficient BOOT balance for entry fee" });
        return;
      }
      await db
        .update(playersTable)
        .set({ bootBalance: player.bootBalance - tournament.entryFeeBoots })
        .where(eq(playersTable.id, playerId));
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

export default router;
