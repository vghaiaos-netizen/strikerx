import { db, playersTable, affiliatesTable, transactionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Credits a commission to an affiliate owner when a referred player wins.
 * Fire-and-forget safe — catches all errors internally.
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

    // Update aggregate on affiliate record
    const prevEarned = parseFloat(String(affiliate.totalEarned ?? 0));
    await db
      .update(affiliatesTable)
      .set({ totalEarned: prevEarned + commission })
      .where(eq(affiliatesTable.id, affiliate.id));

    // If the affiliate has a linked player account, credit their balance
    if (affiliate.ownerId) {
      const [owner] = await db
        .select({ strikerBalance: playersTable.strikerBalance })
        .from(playersTable)
        .where(eq(playersTable.id, affiliate.ownerId));

      if (owner) {
        await db
          .update(playersTable)
          .set({ strikerBalance: owner.strikerBalance + commission })
          .where(eq(playersTable.id, affiliate.ownerId));

        await db.insert(transactionsTable).values({
          playerId: affiliate.ownerId,
          type: "referral",
          amountStriker: commission,
          status: "completed",
        });
      }
    }

    logger.info(
      { playerId, affiliateCode: player.affiliateCode, commission },
      "Affiliate commission credited",
    );
  } catch (err) {
    logger.error({ err, playerId }, "Failed to credit affiliate commission");
  }
}
