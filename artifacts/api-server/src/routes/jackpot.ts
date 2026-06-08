import { Router, type IRouter } from "express";
import { db, jackpotTable, playersTable, transactionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";
import { getConfigFloat, setConfig } from "../lib/configService";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// GET /jackpot — public endpoint for the jackpot bar
router.get("/jackpot", async (_req, res): Promise<void> => {
  let [jackpot] = await db.select().from(jackpotTable).limit(1);

  if (!jackpot) {
    const seedAmount = parseFloat(process.env.JACKPOT_SEED_AMOUNT ?? "10");
    const inserted = await db
      .insert(jackpotTable)
      .values({ currentAmountTon: seedAmount, seedAmount, status: "building" })
      .returning();
    jackpot = inserted[0];
  }

  const minPool = await getConfigFloat("jackpot_min_pool", 50);
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

// ── ADMIN ────────────────────────────────────────────────────────────────────

// GET /admin/jackpot — full jackpot state for admin
router.get("/admin/jackpot", requireAdmin, async (_req, res): Promise<void> => {
  const [jackpot] = await db.select().from(jackpotTable).limit(1);
  if (!jackpot) { res.json(null); return; }

  const minPool = await getConfigFloat("jackpot_min_pool", 50);
  const seedAmount = await getConfigFloat("jackpot_seed_amount", 10);
  const houseCut = await getConfigFloat("jackpot_house_cut", 10);

  res.json({
    currentAmountTon: jackpot.currentAmountTon,
    status: jackpot.status,
    minimumTrigger: minPool,
    seedAmount,
    houseCutPct: houseCut,
    lastWinner: jackpot.lastWinnerUsername ?? null,
    lastWinnerId: jackpot.lastWinnerId ?? null,
    lastTriggeredAt: jackpot.lastTriggeredAt?.toISOString() ?? null,
    percentFull: Math.min(100, (jackpot.currentAmountTon / minPool) * 100),
  });
});

// PATCH /admin/jackpot/config — update jackpot configuration
router.patch("/admin/jackpot/config", requireAdmin, async (req, res): Promise<void> => {
  const { minimumTrigger, seedAmount, houseCutPct } = req.body as {
    minimumTrigger?: number;
    seedAmount?: number;
    houseCutPct?: number;
  };

  if (minimumTrigger !== undefined) await setConfig("jackpot_min_pool", String(minimumTrigger));
  if (seedAmount !== undefined) await setConfig("jackpot_seed_amount", String(seedAmount));
  if (houseCutPct !== undefined) await setConfig("jackpot_house_cut", String(houseCutPct));

  logger.info({ minimumTrigger, seedAmount, houseCutPct }, "Jackpot config updated");
  res.json({ ok: true });
});

// POST /admin/jackpot/trigger — manually pay out jackpot to a player and reset
router.post("/admin/jackpot/trigger", requireAdmin, async (req, res): Promise<void> => {
  const { playerId } = req.body as { playerId?: number };

  const [jackpot] = await db.select().from(jackpotTable).limit(1);
  if (!jackpot) { res.status(404).json({ error: "No jackpot record found" }); return; }

  const seedAmount = await getConfigFloat("jackpot_seed_amount", 10);
  const houseCutPct = await getConfigFloat("jackpot_house_cut", 10);
  const winnerAmount = jackpot.currentAmountTon * ((100 - houseCutPct) / 100);

  let winnerUsername = "admin_trigger";

  if (playerId) {
    const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
    if (!player) { res.status(404).json({ error: "Player not found" }); return; }
    winnerUsername = player.username;

    const strikerRate = await getConfigFloat("striker_deposit_rate", 100);
    const strikerWin = Math.floor(winnerAmount * strikerRate);

    await db
      .update(playersTable)
      .set({ strikerBalance: sql`${playersTable.strikerBalance} + ${strikerWin}` })
      .where(eq(playersTable.id, playerId));

    await db.insert(transactionsTable).values({
      playerId,
      type: "win",
      amountStriker: strikerWin,
      amountTon: winnerAmount,
      status: "completed",
    });
  }

  await db
    .update(jackpotTable)
    .set({
      currentAmountTon: seedAmount,
      status: "building",
      lastTriggeredAt: new Date(),
      lastWinnerId: playerId ?? null,
      lastWinnerUsername: winnerUsername,
    })
    .where(eq(jackpotTable.id, jackpot.id));

  logger.info({ playerId, winnerAmount, winnerUsername }, "Jackpot manually triggered");
  res.json({ ok: true, winnerAmount, winnerUsername, newPool: seedAmount });
});

// POST /admin/jackpot/reset — reset pool to seed without paying out
router.post("/admin/jackpot/reset", requireAdmin, async (req, res): Promise<void> => {
  const { amount } = req.body as { amount?: number };

  const [jackpot] = await db.select().from(jackpotTable).limit(1);
  if (!jackpot) { res.status(404).json({ error: "No jackpot record found" }); return; }

  const seedAmount = amount ?? await getConfigFloat("jackpot_seed_amount", 10);

  await db
    .update(jackpotTable)
    .set({ currentAmountTon: seedAmount, status: "building" })
    .where(eq(jackpotTable.id, jackpot.id));

  logger.info({ seedAmount }, "Jackpot reset");
  res.json({ ok: true, currentAmountTon: seedAmount });
});

export default router;
