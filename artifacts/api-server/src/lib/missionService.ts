import { db, playersTable, transactionsTable, dailyMissionsTable } from "@workspace/db";
import type { DailyMission } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "./logger";

function getTodayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Progresses daily missions for a player after a game event.
 * Keys: play_any_3, play_penalty_1, play_minefield_1, play_freekick_1, shot_2x, win_streak_2, bet_500
 *
 * Call this after every completed game. Safe to call multiple times — idempotent per mission completion.
 */
export async function progressMissions(playerId: number, keys: string[]): Promise<void> {
  if (!keys.length) return;
  const today = getTodayUtc();

  try {
    const [row] = await db.select()
      .from(dailyMissionsTable)
      .where(and(eq(dailyMissionsTable.playerId, playerId), eq(dailyMissionsTable.date, today)));

    if (!row || row.allCompleted) return;

    const missions = row.missions as DailyMission[];
    let changed = false;

    const updated = missions.map(m => {
      if (!keys.includes(m.key) || m.completed) return m;
      const progress = Math.min(m.target, m.progress + 1);
      const completed = progress >= m.target;
      if (progress !== m.progress) changed = true;
      return { ...m, progress, completed };
    });

    if (!changed) return;

    const allCompleted = updated.every(m => m.completed);
    await db.update(dailyMissionsTable)
      .set({ missions: updated, allCompleted })
      .where(eq(dailyMissionsTable.id, row.id));

    if (allCompleted && !row.bonusClaimed) {
      await db.update(dailyMissionsTable).set({ bonusClaimed: true }).where(eq(dailyMissionsTable.id, row.id));
      await db.update(playersTable)
        .set({ strikerBalance: sql`${playersTable.strikerBalance} + ${row.bonusStriker}` })
        .where(eq(playersTable.id, playerId));
      await db.insert(transactionsTable).values({
        playerId,
        type: "bonus",
        amountStriker: row.bonusStriker,
        status: "completed",
      });
      logger.info({ playerId, bonusStriker: row.bonusStriker }, "Daily missions complete — bonus awarded");
    }
  } catch (err) {
    logger.warn({ err, playerId }, "Mission progress update failed (non-fatal)");
  }
}
