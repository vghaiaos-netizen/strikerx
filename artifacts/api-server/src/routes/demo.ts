import { Router, type IRouter } from "express";
import { db, demoPositionsTable, tradingAssetsTable, playersTable } from "@workspace/db";
import { eq, and, lte, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { getPrice } from "../lib/binanceFeed";
import { getConfig, getConfigFloat } from "../lib/configService";
import { broadcastToPlayer } from "../lib/wsServer";
import { logger } from "../lib/logger";

const router: IRouter = Router();

type ContractType = "UP_DOWN" | "EVEN_ODD" | "OVER_UNDER" | "IN_OUT";
type Direction    = "UP" | "DOWN" | "EVEN" | "ODD" | "OVER" | "UNDER" | "IN" | "OUT";

const CONTRACT_DIRECTIONS: Record<ContractType, Direction[]> = {
  UP_DOWN:    ["UP", "DOWN"],
  EVEN_ODD:   ["EVEN", "ODD"],
  OVER_UNDER: ["OVER", "UNDER"],
  IN_OUT:     ["IN", "OUT"],
};

function determineOutcome(
  contractType: ContractType,
  direction: Direction,
  entryPrice: number,
  exitPrice: number,
  lowerBarrier: number | null,
  upperBarrier: number | null,
): "win" | "loss" | "cancelled" {
  switch (contractType) {
    case "UP_DOWN":
      if (exitPrice === entryPrice) return "cancelled";
      return direction === "UP" ? (exitPrice > entryPrice ? "win" : "loss") : (exitPrice < entryPrice ? "win" : "loss");
    case "EVEN_ODD": {
      const d = Math.floor(Math.abs(exitPrice)) % 10;
      return direction === "EVEN" ? (d % 2 === 0 ? "win" : "loss") : (d % 2 !== 0 ? "win" : "loss");
    }
    case "OVER_UNDER": {
      const d = Math.floor(Math.abs(exitPrice)) % 10;
      return direction === "OVER" ? (d >= 5 ? "win" : "loss") : (d < 5 ? "win" : "loss");
    }
    case "IN_OUT": {
      if (lowerBarrier === null || upperBarrier === null) return "cancelled";
      const isIn = exitPrice >= lowerBarrier && exitPrice <= upperBarrier;
      return direction === "IN" ? (isIn ? "win" : "loss") : (!isIn ? "win" : "loss");
    }
    default: return "cancelled";
  }
}

// POST /api/trading/demo/positions
router.post("/trading/demo/positions", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  const { assetSymbol, direction, contractType = "UP_DOWN", stake, contractDurationSecs } = req.body as {
    assetSymbol: string;
    direction: string;
    contractType?: string;
    stake: number;
    contractDurationSecs: number;
  };

  if (!assetSymbol || !direction || !stake || !contractDurationSecs) {
    res.status(400).json({ error: "assetSymbol, direction, stake and contractDurationSecs are required" });
    return;
  }

  const tradingEnabled = await getConfig("trading_enabled");
  if (tradingEnabled === "false") { res.status(403).json({ error: "Trading is currently disabled" }); return; }

  const ct = contractType.toUpperCase() as ContractType;
  const validDirections = CONTRACT_DIRECTIONS[ct];
  if (!validDirections?.includes(direction.toUpperCase() as Direction)) {
    res.status(400).json({ error: `Direction "${direction}" not valid for "${ct}"` });
    return;
  }

  const stakeNum = parseFloat(String(stake));
  if (isNaN(stakeNum) || stakeNum < 1 || stakeNum > 10000) {
    res.status(400).json({ error: "Stake must be between 1 and 10000 USDT" });
    return;
  }

  const available = (await getConfig("trading_available_durations") ?? "5,10,15,30,60,300,900")
    .split(",").map((d: string) => parseInt(d.trim(), 10)).filter((d: number) => !isNaN(d));
  if (!available.includes(contractDurationSecs)) {
    res.status(400).json({ error: `Invalid duration. Allowed: ${available.join(", ")}s` });
    return;
  }

  const entryPrice = getPrice(assetSymbol.toUpperCase());
  if (entryPrice === null) { res.status(503).json({ error: "Price feed not ready — try again" }); return; }

  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  const demoBalance = parseFloat(String(player.demoUsdtBalance ?? 10000));
  if (demoBalance < stakeNum) {
    res.status(400).json({ error: `Insufficient demo balance ($${demoBalance.toFixed(2)} USDT). Reset your demo account.` });
    return;
  }

  const [asset] = await db.select().from(tradingAssetsTable).where(
    and(eq(tradingAssetsTable.symbol, assetSymbol.toUpperCase()), eq(tradingAssetsTable.enabled, true)),
  );
  const payoutRatio = asset ? parseFloat(String(asset.payoutRatio)) : 1.82;

  let lowerBarrier: number | null = null;
  let upperBarrier: number | null = null;
  if (ct === "IN_OUT") {
    const spreadPct = await getConfigFloat("trading_inout_spread", 0.5);
    const spread = entryPrice * (spreadPct / 100);
    lowerBarrier = parseFloat((entryPrice - spread).toFixed(8));
    upperBarrier = parseFloat((entryPrice + spread).toFixed(8));
  }

  const expiresAt = new Date(Date.now() + contractDurationSecs * 1_000);

  await db.update(playersTable)
    .set({ demoUsdtBalance: sql`${playersTable.demoUsdtBalance} - ${stakeNum}` })
    .where(eq(playersTable.id, playerId));

  const [position] = await db.insert(demoPositionsTable).values({
    playerId,
    assetSymbol: assetSymbol.toUpperCase(),
    direction:   direction.toUpperCase() as Direction,
    contractType: ct,
    stake: stakeNum,
    entryPrice,
    payoutRatio,
    contractDurationSecs,
    expiresAt,
    lowerBarrier,
    upperBarrier,
    outcome: "pending",
  }).returning();

  req.log.info({ playerId, positionId: position.id, asset: assetSymbol, stake: stakeNum }, "Demo position opened");
  res.json({ success: true, positionId: position.id, entryPrice, expiresAt, lowerBarrier, upperBarrier });
});

// GET /api/trading/demo/positions/active
router.get("/trading/demo/positions/active", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  const [positions, playerRows] = await Promise.all([
    db.select().from(demoPositionsTable)
      .where(and(eq(demoPositionsTable.playerId, playerId), eq(demoPositionsTable.outcome, "pending")))
      .orderBy(desc(demoPositionsTable.createdAt)),
    db.select().from(playersTable).where(eq(playersTable.id, playerId)),
  ]);
  const player = playerRows[0];
  res.json({
    positions: positions.map(mapDemoPosition),
    demoBalance: parseFloat(String(player?.demoUsdtBalance ?? 10000)),
  });
});

// GET /api/trading/demo/positions — history
router.get("/trading/demo/positions", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  const limit = Math.min(parseInt(String(req.query.limit ?? 50)), 100);
  const [positions, playerRows] = await Promise.all([
    db.select().from(demoPositionsTable)
      .where(eq(demoPositionsTable.playerId, playerId))
      .orderBy(desc(demoPositionsTable.createdAt))
      .limit(limit),
    db.select().from(playersTable).where(eq(playersTable.id, playerId)),
  ]);
  const player = playerRows[0];
  res.json({
    positions: positions.map(mapDemoPosition),
    demoBalance: parseFloat(String(player?.demoUsdtBalance ?? 10000)),
  });
});

// POST /api/trading/demo/reset
router.post("/trading/demo/reset", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  const startBalance  = await getConfigFloat("trading_demo_start_balance", 10000);
  const maxDailyResets = await getConfigFloat("trading_demo_daily_resets", 3);

  const now = new Date();
  const lastReset = player.demoLastReset ? new Date(player.demoLastReset) : null;
  const isSameDay = lastReset &&
    lastReset.getUTCFullYear() === now.getUTCFullYear() &&
    lastReset.getUTCMonth() === now.getUTCMonth() &&
    lastReset.getUTCDate() === now.getUTCDate();

  const resetCount = isSameDay ? (player.demoResetCount ?? 0) : 0;
  if (resetCount >= maxDailyResets) {
    res.status(429).json({ error: `Max ${maxDailyResets} resets/day reached. Try again tomorrow.` });
    return;
  }

  await db.update(playersTable)
    .set({ demoUsdtBalance: startBalance, demoResetCount: isSameDay ? resetCount + 1 : 1, demoLastReset: now })
    .where(eq(playersTable.id, playerId));

  req.log.info({ playerId, newBalance: startBalance }, "Demo balance reset");
  res.json({
    success: true,
    demoBalance: startBalance,
    resetsUsed: resetCount + 1,
    resetsRemaining: maxDailyResets - resetCount - 1,
  });
});

function mapDemoPosition(p: typeof demoPositionsTable.$inferSelect) {
  return {
    id: p.id,
    assetSymbol: p.assetSymbol,
    direction: p.direction,
    contractType: p.contractType,
    stake: p.stake,
    entryPrice: p.entryPrice,
    exitPrice: p.exitPrice,
    lowerBarrier: p.lowerBarrier,
    upperBarrier: p.upperBarrier,
    payoutRatio: p.payoutRatio,
    winAmount: p.winAmount,
    outcome: p.outcome,
    contractDurationSecs: p.contractDurationSecs,
    expiresAt: p.expiresAt.toISOString(),
    settledAt: p.settledAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}

// ─── Demo settlement (called from tradingEngine scheduler) ────────────────────
export async function settleDemoPositions(): Promise<void> {
  let expired: (typeof demoPositionsTable.$inferSelect)[];
  try {
    expired = await db.select().from(demoPositionsTable).where(
      and(eq(demoPositionsTable.outcome, "pending"), lte(demoPositionsTable.expiresAt, new Date())),
    );
  } catch (err) {
    logger.error({ err }, "Failed to query expired demo positions");
    return;
  }
  for (const pos of expired) {
    try {
      const exitPrice = getPrice(pos.assetSymbol);
      if (exitPrice === null) continue;
      const ct = pos.contractType as ContractType;
      const dir = pos.direction as Direction;
      const outcome = determineOutcome(ct, dir, pos.entryPrice, exitPrice, pos.lowerBarrier, pos.upperBarrier);
      const winAmount = outcome === "win" ? parseFloat((pos.stake * pos.payoutRatio).toFixed(4)) : 0;
      const creditAmt = outcome === "win" ? winAmount : outcome === "cancelled" ? pos.stake : 0;
      await db.update(demoPositionsTable).set({ outcome, exitPrice, winAmount, settledAt: new Date() }).where(eq(demoPositionsTable.id, pos.id));
      if (creditAmt > 0) {
        await db.update(playersTable).set({ demoUsdtBalance: sql`${playersTable.demoUsdtBalance} + ${creditAmt}` }).where(eq(playersTable.id, pos.playerId));
      }
      broadcastToPlayer(pos.playerId, "trade_settled", {
        positionId: pos.id, assetSymbol: pos.assetSymbol, contractType: ct, direction: dir,
        currency: "DEMO_USDT", outcome, entryPrice: pos.entryPrice, exitPrice,
        lowerBarrier: pos.lowerBarrier, upperBarrier: pos.upperBarrier, winAmount, stake: pos.stake,
        creditAmount: creditAmt, isDemo: true,
      });
      logger.info({ positionId: pos.id, outcome, winAmount }, "Demo position settled");
    } catch (err) {
      logger.error({ err, positionId: pos.id }, "Failed to settle demo position");
    }
  }
}

export default router;
