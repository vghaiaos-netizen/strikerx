import { db, tradingPositionsTable, tradingAssetsTable, demoPositionsTable, playersTable, transactionsTable, gamesTable, pool } from "@workspace/db";
import { eq, and, lte } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getPrice } from "./binanceFeed";
import { broadcastToAll, broadcastToPlayer } from "./wsServer";
import { logger } from "./logger";
import { creditAffiliateCommission } from "./affiliateCommission";
import { getConfigFloat, getConfig } from "./configService";

export type ContractType   = "UP_DOWN" | "EVEN_ODD" | "OVER_UNDER" | "IN_OUT";
export type TradingCurrency = "TON" | "USDT" | "STRIKER";
export type Direction       = "UP" | "DOWN" | "EVEN" | "ODD" | "OVER" | "UNDER" | "IN" | "OUT";

const CONTRACT_DIRECTIONS: Record<ContractType, Direction[]> = {
  UP_DOWN:    ["UP", "DOWN"],
  EVEN_ODD:   ["EVEN", "ODD"],
  OVER_UNDER: ["OVER", "UNDER"],
  IN_OUT:     ["IN", "OUT"],
};

// ─── Settlement outcome logic ──────────────────────────────────────────────────
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
      if (direction === "UP") return exitPrice > entryPrice ? "win" : "loss";
      return exitPrice < entryPrice ? "win" : "loss";

    case "EVEN_ODD": {
      const lastDigit = Math.floor(Math.abs(exitPrice)) % 10;
      const isEven    = lastDigit % 2 === 0;
      return direction === "EVEN" ? (isEven ? "win" : "loss") : (!isEven ? "win" : "loss");
    }

    case "OVER_UNDER": {
      const lastDigit = Math.floor(Math.abs(exitPrice)) % 10;
      const isOver    = lastDigit >= 5;
      return direction === "OVER" ? (isOver ? "win" : "loss") : (!isOver ? "win" : "loss");
    }

    case "IN_OUT": {
      if (lowerBarrier === null || upperBarrier === null) return "cancelled";
      const isIn = exitPrice >= lowerBarrier && exitPrice <= upperBarrier;
      return direction === "IN" ? (isIn ? "win" : "loss") : (!isIn ? "win" : "loss");
    }

    default:
      return "cancelled";
  }
}

// ─── Win-streak payout boost ───────────────────────────────────────────────────
function streakBoost(streak: number): number {
  if (streak >= 5) return 0.07;
  if (streak >= 4) return 0.05;
  if (streak >= 3) return 0.03;
  if (streak >= 2) return 0.02;
  return 0;
}

// ─── Settlement scheduler ──────────────────────────────────────────────────────

let settlementInterval: NodeJS.Timeout | null = null;

export function startTradingSettlementScheduler() {
  if (settlementInterval) return;
  settlementInterval = setInterval(async () => {
    await settleExpiredPositions();
    await settleDemoExpiredPositions();
  }, 1_000);
  logger.info("Trading settlement scheduler started (real + demo)");
}

export function stopTradingSettlementScheduler() {
  if (settlementInterval) { clearInterval(settlementInterval); settlementInterval = null; }
}

async function settleDemoExpiredPositions(): Promise<void> {
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
      const ct = (pos.contractType ?? "UP_DOWN") as ContractType;
      const dir = pos.direction as Direction;
      const lb = pos.lowerBarrier != null ? parseFloat(String(pos.lowerBarrier)) : null;
      const ub = pos.upperBarrier != null ? parseFloat(String(pos.upperBarrier)) : null;
      const outcome = determineOutcome(ct, dir, parseFloat(String(pos.entryPrice)), exitPrice, lb, ub);
      const stake = parseFloat(String(pos.stake));
      const ratio = parseFloat(String(pos.payoutRatio));
      const winAmount = outcome === "win" ? parseFloat((stake * ratio).toFixed(4)) : 0;
      const creditAmt = outcome === "win" ? winAmount : outcome === "cancelled" ? stake : 0;
      await db.update(demoPositionsTable).set({ outcome, exitPrice, winAmount, settledAt: new Date() }).where(eq(demoPositionsTable.id, pos.id));
      if (creditAmt > 0) {
        await db.update(playersTable).set({ demoUsdtBalance: sql`${playersTable.demoUsdtBalance} + ${creditAmt}` }).where(eq(playersTable.id, pos.playerId));
      }
      broadcastToPlayer(pos.playerId, "trade_settled", {
        positionId: pos.id, assetSymbol: pos.assetSymbol, contractType: ct, direction: dir,
        currency: "DEMO_USDT", outcome, entryPrice: parseFloat(String(pos.entryPrice)), exitPrice,
        lowerBarrier: lb, upperBarrier: ub, winAmount, stake, creditAmount: creditAmt, isDemo: true,
      });
      logger.info({ positionId: pos.id, outcome, winAmount, asset: pos.assetSymbol }, "Demo position settled");
    } catch (err) {
      logger.error({ err, positionId: pos.id }, "Failed to settle demo position");
    }
  }
}

async function settleExpiredPositions() {
  let expired: (typeof tradingPositionsTable.$inferSelect)[];
  try {
    expired = await db
      .select()
      .from(tradingPositionsTable)
      .where(and(
        eq(tradingPositionsTable.outcome, "pending"),
        lte(tradingPositionsTable.expiresAt, new Date()),
      ));
  } catch (err) {
    logger.error({ err }, "Failed to query expired trading positions");
    return;
  }
  for (const position of expired) {
    try { await settlePosition(position); }
    catch (err) { logger.error({ err, positionId: position.id }, "Failed to settle trading position"); }
  }
}

async function settlePosition(position: typeof tradingPositionsTable.$inferSelect) {
  const exitPrice = getPrice(position.assetSymbol);
  if (exitPrice === null) {
    logger.warn({ positionId: position.id, asset: position.assetSymbol }, "No price available for settlement — will retry");
    return;
  }

  const entryPrice   = parseFloat(String(position.entryPrice));
  const payoutRatio  = parseFloat(String(position.payoutRatio));
  const stake        = parseFloat(String(position.stakeStriker));
  const contractType = (position.contractType ?? "UP_DOWN") as ContractType;
  const direction    = position.direction as Direction;
  const currency     = (position.currency ?? "TON") as TradingCurrency;
  const lowerBarrier = position.lowerBarrier != null ? parseFloat(String(position.lowerBarrier)) : null;
  const upperBarrier = position.upperBarrier != null ? parseFloat(String(position.upperBarrier)) : null;

  const outcome      = determineOutcome(contractType, direction, entryPrice, exitPrice, lowerBarrier, upperBarrier);
  const winAmount    = outcome === "win" ? parseFloat((stake * payoutRatio).toFixed(8)) : 0;
  const creditAmount = outcome === "cancelled" ? stake : winAmount;

  await db.transaction(async (tx) => {
    await tx
      .update(tradingPositionsTable)
      .set({ outcome, exitPrice, winAmount, settledAt: new Date() })
      .where(eq(tradingPositionsTable.id, position.id));

    if (creditAmount > 0) {
      if (currency === "TON") {
        await tx.update(playersTable)
          .set({ tonBalance: sql`${playersTable.tonBalance} + ${creditAmount}`, lastActive: new Date() })
          .where(eq(playersTable.id, position.playerId));
      } else if (currency === "USDT") {
        await tx.update(playersTable)
          .set({ usdtBalance: sql`${playersTable.usdtBalance} + ${creditAmount}`, lastActive: new Date() })
          .where(eq(playersTable.id, position.playerId));
      } else {
        await tx.update(playersTable)
          .set({ strikerBalance: sql`${playersTable.strikerBalance} + ${creditAmount}`, lastActive: new Date() })
          .where(eq(playersTable.id, position.playerId));
      }

      await tx.insert(transactionsTable).values({
        playerId: position.playerId,
        type: outcome === "win" ? "win" : "refund",
        amountStriker: currency === "STRIKER" ? creditAmount : 0,
        amountTon:     currency !== "STRIKER" ? creditAmount : 0,
        status: "completed",
      });
    }

    await tx.insert(gamesTable).values({
      playerId:         position.playerId,
      gameType:         "trading",
      betStriker:       currency === "STRIKER" ? stake : 0,
      resultMultiplier: outcome === "win" ? payoutRatio : 0,
      winAmount,
      outcome: outcome === "cancelled" ? "cashout" : outcome,
    });
  });

  let newStreak = 0;
  try {
    if (outcome === "win") {
      const r = await pool.query<{ trading_win_streak: number }>(
        `UPDATE players SET trading_win_streak = COALESCE(trading_win_streak,0)+1 WHERE id=$1 RETURNING trading_win_streak`,
        [position.playerId],
      );
      newStreak = Number(r.rows[0]?.trading_win_streak ?? 1);
    } else {
      await pool.query(`UPDATE players SET trading_win_streak=0 WHERE id=$1`, [position.playerId]);
    }
  } catch { /* non-fatal */ }

  broadcastToPlayer(position.playerId, "trade_settled", {
    positionId:   position.id,
    assetSymbol:  position.assetSymbol,
    contractType,
    direction,
    currency,
    outcome,
    entryPrice,
    exitPrice,
    lowerBarrier,
    upperBarrier,
    winAmount,
    stake,
    creditAmount,
    streak: newStreak,
  });

  const threshold = await getConfigFloat("trading_big_win_threshold", 1000);
  if (outcome === "win" && winAmount >= threshold) {
    broadcastToAll("big_win", { game: `${position.assetSymbol} trade`, winAmount, currency, at: Date.now() });
  }

  logger.info({ positionId: position.id, outcome, winAmount, currency, asset: position.assetSymbol }, "Trading position settled");

  if (outcome === "win" && winAmount > 0 && currency === "STRIKER") {
    creditAffiliateCommission(position.playerId, winAmount).catch((err) =>
      logger.error({ err, positionId: position.id }, "Failed to credit affiliate commission on trade win"),
    );
  }
}

// ─── Open position ─────────────────────────────────────────────────────────────

export async function openPosition(params: {
  playerId:             number;
  assetSymbol:          string;
  direction:            Direction;
  contractType:         ContractType;
  currency:             TradingCurrency;
  stake:                number;
  contractDurationSecs: number;
}): Promise<
  | { success: true; positionId: number; entryPrice: number; expiresAt: Date; lowerBarrier: number | null; upperBarrier: number | null }
  | { success: false; error: string }
> {
  const { playerId, assetSymbol, direction, contractType, currency, stake, contractDurationSecs } = params;

  const tradingEnabled = await getConfig("trading_enabled");
  if (tradingEnabled === "false") return { success: false, error: "Trading is currently disabled" };

  const validDirections = CONTRACT_DIRECTIONS[contractType];
  if (!validDirections?.includes(direction)) {
    return { success: false, error: `Direction "${direction}" is not valid for contract type "${contractType}"` };
  }

  const [asset] = await db
    .select()
    .from(tradingAssetsTable)
    .where(and(eq(tradingAssetsTable.symbol, assetSymbol.toUpperCase()), eq(tradingAssetsTable.enabled, true)));
  if (!asset) return { success: false, error: "Asset not available" };

  // Stake limits per currency
  const minStake = currency === "STRIKER"
    ? parseFloat(String(asset.minStakeStriker))
    : parseFloat(String(asset.minStakeTon ?? 0.1));
  const maxStake = currency === "STRIKER"
    ? parseFloat(String(asset.maxStakeStriker))
    : parseFloat(String(asset.maxStakeTon ?? 500));

  if (stake < minStake) return { success: false, error: `Minimum stake is ${minStake} ${currency}` };
  if (stake > maxStake) return { success: false, error: `Maximum stake is ${maxStake} ${currency}` };

  const availableDurations = (await getConfig("trading_available_durations") ?? "30,60,300,900")
    .split(",").map((d) => parseInt(d.trim(), 10)).filter((d) => !isNaN(d));
  if (!availableDurations.includes(contractDurationSecs)) {
    return { success: false, error: `Invalid duration. Allowed: ${availableDurations.join(", ")} seconds` };
  }

  const entryPrice = getPrice(assetSymbol.toUpperCase());
  if (entryPrice === null) return { success: false, error: "Price feed not ready — try again in a moment" };

  // Compute barriers for IN_OUT contracts
  let lowerBarrier: number | null = null;
  let upperBarrier: number | null = null;
  if (contractType === "IN_OUT") {
    const spreadPct = await getConfigFloat("trading_inout_spread", 0.5);
    const spread    = entryPrice * (spreadPct / 100);
    lowerBarrier    = parseFloat((entryPrice - spread).toFixed(8));
    upperBarrier    = parseFloat((entryPrice + spread).toFixed(8));
  }

  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
  if (!player) return { success: false, error: "Player not found" };

  const balance = currency === "TON"
    ? parseFloat(String(player.tonBalance))
    : currency === "USDT"
      ? parseFloat(String(player.usdtBalance))
      : parseFloat(String(player.strikerBalance));

  if (balance < stake) {
    return { success: false, error: `Insufficient ${currency} balance (you have ${balance.toFixed(currency === "STRIKER" ? 0 : 4)})` };
  }

  let currentStreak = 0;
  try {
    const r = await pool.query<{ trading_win_streak: number }>(
      `SELECT COALESCE(trading_win_streak,0) AS trading_win_streak FROM players WHERE id=$1`,
      [playerId],
    );
    currentStreak = Number(r.rows[0]?.trading_win_streak ?? 0);
  } catch { /* non-fatal */ }

  const baseRatio   = parseFloat(String(asset.payoutRatio));
  const boost       = streakBoost(currentStreak);
  const payoutRatio = boost > 0 ? parseFloat(Math.min(1.95, baseRatio + baseRatio * boost).toFixed(4)) : baseRatio;
  const expiresAt   = new Date(Date.now() + contractDurationSecs * 1_000);

  const [position] = await db.transaction(async (tx) => {
    if (currency === "TON") {
      await tx.update(playersTable)
        .set({ tonBalance: sql`${playersTable.tonBalance} - ${stake}`, lastActive: new Date() })
        .where(eq(playersTable.id, playerId));
    } else if (currency === "USDT") {
      await tx.update(playersTable)
        .set({ usdtBalance: sql`${playersTable.usdtBalance} - ${stake}`, lastActive: new Date() })
        .where(eq(playersTable.id, playerId));
    } else {
      await tx.update(playersTable)
        .set({ strikerBalance: sql`${playersTable.strikerBalance} - ${stake}`, lastActive: new Date() })
        .where(eq(playersTable.id, playerId));
    }

    await tx.insert(transactionsTable).values({
      playerId,
      type:          "bet",
      amountStriker: currency === "STRIKER" ? -stake : 0,
      amountTon:     currency !== "STRIKER" ? -stake : 0,
      status:        "completed",
    });

    return await tx.insert(tradingPositionsTable).values({
      playerId,
      assetSymbol:          assetSymbol.toUpperCase(),
      direction:            direction.toUpperCase() as Direction,
      contractType,
      currency,
      stakeStriker:         stake,
      entryPrice,
      payoutRatio,
      contractDurationSecs,
      expiresAt,
      outcome:              "pending",
      lowerBarrier,
      upperBarrier,
    }).returning();
  });

  return { success: true, positionId: position.id, entryPrice, expiresAt, lowerBarrier, upperBarrier };
}

// ─── Asset listing ─────────────────────────────────────────────────────────────

export async function getEnabledAssets() {
  return db.select().from(tradingAssetsTable).where(eq(tradingAssetsTable.enabled, true)).orderBy(tradingAssetsTable.sortOrder);
}
