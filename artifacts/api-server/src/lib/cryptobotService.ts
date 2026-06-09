import { db, withdrawalsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { broadcastWithdrawal } from "./groupBot";

export async function processCryptoBotTransfer(
  withdrawalId: number,
  telegramUserId: number,
  amountTon: number,
  address: string,
  username: string,
) {
  const cryptobotToken = process.env.CRYPTOBOT_TOKEN;
  if (!cryptobotToken) return;

  try {
    const response = await fetch("https://pay.crypt.bot/api/transfer", {
      method: "POST",
      headers: {
        "Crypto-Pay-API-Token": cryptobotToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: telegramUserId,
        asset: "TON",
        amount: amountTon.toString(),
        spend_id: `withdrawal_${withdrawalId}`,
        comment: "StrikerX withdrawal",
      }),
    });

    const data = (await response.json()) as { ok: boolean; result?: { transfer_id: string } };

    const newStatus = data.ok ? "completed" : "failed";
    await db
      .update(withdrawalsTable)
      .set({ status: newStatus, externalTransferId: data.result?.transfer_id })
      .where(eq(withdrawalsTable.id, withdrawalId));

    if (data.ok) {
      broadcastWithdrawal(username, amountTon).catch(() => {});
    }
  } catch (err) {
    logger.error({ err }, "CryptoBot transfer failed");
    await db.update(withdrawalsTable).set({ status: "failed" }).where(eq(withdrawalsTable.id, withdrawalId));
  }
}
