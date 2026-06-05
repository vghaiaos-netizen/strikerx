import { Router, type IRouter } from "express";
import { db, jackpotTable } from "@workspace/db";

const router: IRouter = Router();

// GET /jackpot
router.get("/jackpot", async (_req, res): Promise<void> => {
  let [jackpot] = await db.select().from(jackpotTable).limit(1);

  if (!jackpot) {
    // Initialize jackpot
    const seedAmount = parseFloat(process.env.JACKPOT_SEED_AMOUNT ?? "10");
    const inserted = await db
      .insert(jackpotTable)
      .values({ currentAmountTon: seedAmount, seedAmount, status: "building" })
      .returning();
    jackpot = inserted[0];
  }

  const minPool = parseFloat(process.env.JACKPOT_MIN_POOL ?? "50");
  const percentFull = Math.min(100, (jackpot.currentAmountTon / minPool) * 100);

  res.json({
    currentAmountTon: jackpot.currentAmountTon,
    minimumTrigger: minPool,
    status: jackpot.status,
    lastWinner: jackpot.lastWinnerUsername ?? null,
    lastTriggeredAt: jackpot.lastTriggeredAt?.toISOString() ?? null,
    percentFull,
  });
});

export default router;
