import { db, tournamentsTable, tournamentEntriesTable, playersTable, transactionsTable } from "@workspace/db";
import { eq, lt, and, desc } from "drizzle-orm";
import { logger } from "./logger";
import { broadcastToAll } from "./wsServer";

const PRIZE_DISTRIBUTION = [0.5, 0.25, 0.15, 0.07, 0.03];

async function processTournamentEnds() {
  const now = new Date();

  const expired = await db
    .select()
    .from(tournamentsTable)
    .where(and(eq(tournamentsTable.status, "active"), lt(tournamentsTable.endTime, now)));

  for (const tournament of expired) {
    try {
      const depositRate = parseFloat(process.env.STRIKER_DEPOSIT_RATE ?? "100");

      const entries = await db
        .select()
        .from(tournamentEntriesTable)
        .where(eq(tournamentEntriesTable.tournamentId, tournament.id))
        .orderBy(desc(tournamentEntriesTable.bestMultiplier));

      // Mark tournament ended first to prevent double-processing
      await db.update(tournamentsTable).set({ status: "ended" }).where(eq(tournamentsTable.id, tournament.id));

      // Pay prizes to top finishers
      for (let i = 0; i < Math.min(entries.length, PRIZE_DISTRIBUTION.length); i++) {
        const entry = entries[i]!;
        const prizeTon    = tournament.prizePoolTon * (PRIZE_DISTRIBUTION[i] ?? 0);
        const prizeStriker = Math.floor(prizeTon * depositRate);

        if (prizeStriker <= 0) continue;

        const [player] = await db.select().from(playersTable).where(eq(playersTable.id, entry.playerId));
        if (!player) continue;

        await db.update(playersTable)
          .set({ strikerBalance: player.strikerBalance + prizeStriker })
          .where(eq(playersTable.id, entry.playerId));

        await db.insert(transactionsTable).values({
          playerId: entry.playerId,
          type:     "bonus",
          amountStriker: prizeStriker,
          status:   "completed",
        });
      }

      broadcastToAll("tournament_ended", {
        tournamentId:  tournament.id,
        type:          tournament.type,
        prizePoolTon:  tournament.prizePoolTon,
        winnerId:      entries[0]?.playerId ?? null,
        at:            Date.now(),
      });

      logger.info({ tournamentId: tournament.id, entrants: entries.length }, "Tournament auto-ended and prizes paid");
    } catch (err) {
      logger.error({ err, tournamentId: tournament.id }, "Failed to auto-end tournament");
    }
  }
}

export function startScheduler() {
  logger.info("Scheduler started");
  // Run once immediately, then every 60 seconds
  processTournamentEnds().catch(() => {});
  setInterval(() => { processTournamentEnds().catch(() => {}); }, 60_000);
}
