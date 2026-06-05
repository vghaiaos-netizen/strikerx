import { db, minefieldSessionsTable, playersTable, transactionsTable } from "@workspace/db";
import { eq, and, lt, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

async function cleanExpiredSessions(): Promise<void> {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

  const expired = await db
    .select()
    .from(minefieldSessionsTable)
    .where(and(eq(minefieldSessionsTable.status, "active"), lt(minefieldSessionsTable.createdAt, tenMinutesAgo)));

  if (expired.length === 0) return;

  for (const session of expired) {
    try {
      // Mark expired first to prevent double-refund
      await db
        .update(minefieldSessionsTable)
        .set({ status: "expired" })
        .where(and(eq(minefieldSessionsTable.id, session.id), eq(minefieldSessionsTable.status, "active")));

      // Refund the locked bet atomically
      await db
        .update(playersTable)
        .set({ strikerBalance: sql`${playersTable.strikerBalance} + ${session.betStriker}` })
        .where(eq(playersTable.id, session.playerId));

      await db.insert(transactionsTable).values({
        playerId: session.playerId,
        type: "refund",
        amountStriker: session.betStriker,
        status: "completed",
        externalId: `minefield_expired_${session.id}`,
      });
    } catch (err) {
      logger.error({ err, sessionId: session.id }, "Failed to clean minefield session");
    }
  }

  logger.info({ cleaned: expired.length }, "Cleaned expired minefield sessions");
}

export function startSessionCleaner(): void {
  logger.info("Session cleaner started");
  // Run every 5 minutes
  setInterval(() => {
    cleanExpiredSessions().catch((err) => logger.error({ err }, "Session cleaner error"));
  }, 5 * 60 * 1000);
}
