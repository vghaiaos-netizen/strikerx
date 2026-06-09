import { db, playersTable, affiliatesTable, transactionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Credits a commission to an affiliate owner when a referred player wins.
 * Fire-and-forget safe — catches all errors internally.
 * Uses SQL expressions for all balance updates to avoid stale-read race conditions.
 */
export async function creditAffiliateCommission(
  playerId: number,
  winAmountStriker: number,
): Promise<void> {
  if (winAmountStriker <= 0) return;

  try {
    const [player] = await db
      .select({ affiliateCode: playersTable.affiliateCode })
      .from(playersTable)
      .where(eq(playersTable.id, playerId));

    if (!player?.affiliateCode) return;

    const [affiliate] = await db
      .select()
      .from(affiliatesTable)
      .where(eq(affiliatesTable.code, player.affiliateCode));

    if (!affiliate?.isActive) return;

    const rate = parseFloat(String(affiliate.commissionRate));
    const commission = Math.floor(winAmountStriker * rate);
    if (commission <= 0) return;

    // Atomic increment — avoids stale-read race if two wins fire concurrently
    await db
      .update(affiliatesTable)
      .set({ totalEarned: sql`${affiliatesTable.totalEarned} + ${commission}` })
      .where(eq(affiliatesTable.id, affiliate.id));

    // If the affiliate has a linked player account, credit their balance atomically
    if (affiliate.ownerId) {
      await db
        .update(playersTable)
        .set({ strikerBalance: sql`${playersTable.strikerBalance} + ${commission}` })
        .where(eq(playersTable.id, affiliate.ownerId));

      await db.insert(transactionsTable).values({
        playerId: affiliate.ownerId,
        type: "referral",
        amountStriker: commission,
        status: "completed",
      });
    }

    logger.info(
      { playerId, affiliateCode: player.affiliateCode, commission },
      "Affiliate commission credited",
    );
  } catch (err) {
    logger.error({ err, playerId }, "Failed to credit affiliate commission");
  }
}
