import { db, tradingPositionsTable, tradingAssetsTable, playersTable, transactionsTable, gamesTable, pool } from "@workspace/db";
import { eq, and, lte } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getPrice } from "./binanceFeed";
import { broadcastToAll, broadcastToPlayer } from "./wsServer";
import { logger } from "./logger";
import { creditAffiliateCommission } from "./affiliateCommission";
import { getConfigFloat, getConfig } from "./configService";

// ─── Win-streak payout boost ───────────────────────────────────────────────────
// Consecutive wins earn a small payout ratio boost, capped at 1.95×.
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
  settlementInterval = setInterval(settleExpiredPositions, 1_000);
  logger.info("Trading settlement scheduler started");
}

export function stopTradingSettlementScheduler() {
  if (settlementInterval) { clearInterval(settlementInterval); settlementInterval = null; }
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
    try {
      await settlePosition(position);
    } catch (err) {
      logger.error({ err, positionId: position.id }, "Failed to settle trading position");
    }
  }
}

async function settlePosition(position: typeof tradingPositionsTable.$inferSelect) {
  const exitPrice = getPrice(position.assetSymbol);

  if (exitPrice === null) {
    // Price feed not ready yet — skip, will retry next second
    logger.warn({ positionId: position.id, asset: position.assetSymbol }, "No price available for settlement — will retry");
    return;
  }

  const entryPrice = parseFloat(String(position.entryPrice));
  const payoutRatio = parseFloat(String(position.payoutRatio));
  const stakeStriker = parseFloat(String(position.stakeStriker));

  let outcome: "win" | "loss" | "cancelled";
  if (exitPrice === entryPrice) {
    outcome = "cancelled"; // push — refund stake
  } else if (position.direction === "UP") {
    outcome = exitPrice > entryPrice ? "win" : "loss";
  } else {
    outcome = exitPrice < entryPrice ? "win" : "loss";
  }

  const winAmount = outcome === "win" ? parseFloat((stakeStriker * payoutRatio).toFixed(2)) : 0;
  // On cancel: full refund. On win: payout (already includes stake via ratio > 1). On loss: 0.
  const creditAmount = outcome === "cancelled" ? stakeStriker : winAmount;

  await db.transaction(async (tx) => {
    await tx
      .update(tradingPositionsTable)
      .set({ outcome, exitPrice, winAmount, settledAt: new Date() })
      .where(eq(tradingPositionsTable.id, position.id));

    if (creditAmount > 0) {
      await tx
        .update(playersTable)
        .set({
          strikerBalance: sql`${playersTable.strikerBalance} + ${creditAmount}`,
          lastActive: new Date(),
        })
        .where(eq(playersTable.id, position.playerId));

      await tx.insert(transactionsTable).values({
        playerId: position.playerId,
        type: outcome === "win" ? "win" : "refund",
        amountStriker: creditAmount,
        status: "completed",
      });
    }

    // Log in games table so existing analytics/VIP wager tracking still work
    await tx.insert(gamesTable).values({
      playerId: position.playerId,
      gameType: "trading",
      betStriker: stakeStriker,
      resultMultiplier: outcome === "win" ? payoutRatio : 0,
      winAmount: winAmount,
      outcome: outcome === "cancelled" ? "cashout" : outcome,
    });
  });

  // Update win streak (best-effort — column added via migration, may not exist on very first deploy)
  let newStreak = 0;
  try {
    if (outcome === "win") {
      const r = await pool.query<{ trading_win_streak: number }>(
        `UPDATE players SET trading_win_streak = COALESCE(trading_win_streak, 0) + 1 WHERE id = $1 RETURNING trading_win_streak`,
        [position.playerId],
      );
      newStreak = Number(r.rows[0]?.trading_win_streak ?? 1);
    } else {
      await pool.query(`UPDATE players SET trading_win_streak = 0 WHERE id = $1`, [position.playerId]);
      newStreak = 0;
    }
  } catch {
    // Non-fatal — column may not exist yet on first deploy
  }

  // Notify the specific player
  broadcastToPlayer(position.playerId, "trade_settled", {
    positionId: position.id,
    assetSymbol: position.assetSymbol,
    direction: position.direction,
    outcome,
    entryPrice,
    exitPrice,
    winAmount,
    stakeStriker,
    creditAmount,
    streak: newStreak,
  });

  // Announce big wins to the group channel (uses same threshold as casino)
  const threshold = await getConfigFloat("trading_big_win_threshold", 1000);
  if (outcome === "win" && winAmount >= threshold) {
    broadcastToAll("big_win", {
      game: `${position.assetSymbol} trade`,
      winAmount,
      at: Date.now(),
    });
  }

  logger.info({ positionId: position.id, outcome, winAmount, asset: position.assetSymbol }, "Trading position settled");

  if (outcome === "win" && winAmount > 0) {
    creditAffiliateCommission(position.playerId, winAmount).catch((err) =>
      logger.error({ err, positionId: position.id }, "Failed to credit affiliate commission on trade win"),
    );
  }
}

// ─── Open position ─────────────────────────────────────────────────────────────

export async function openPosition(params: {
  playerId: number;
  assetSymbol: string;
  direction: "UP" | "DOWN";
  stakeStriker: number;
  contractDurationSecs: number;
}): Promise<
  | { success: true; positionId: number; entryPrice: number; expiresAt: Date }
  | { success: false; error: string }
> {
  const { playerId, assetSymbol, direction, stakeStriker, contractDurationSecs } = params;

  // Default to enabled: if the config key is missing (e.g. first boot before migration),
  // treat as enabled rather than silently blocking all trades.
  const tradingEnabled = await getConfig("trading_enabled");
  if (tradingEnabled === "false") return { success: false, error: "Trading is currently disabled" };

  // Validate asset is enabled
  const [asset] = await db
    .select()
    .from(tradingAssetsTable)
    .where(and(eq(tradingAssetsTable.symbol, assetSymbol.toUpperCase()), eq(tradingAssetsTable.enabled, true)));

  if (!asset) return { success: false, error: "Asset not available" };

  const minStake = parseFloat(String(asset.minStakeStriker));
  const maxStake = parseFloat(String(asset.maxStakeStriker));
  if (stakeStriker < minStake) return { success: false, error: `Minimum stake is ${minStake} STRIKER` };
  if (stakeStriker > maxStake) return { success: false, error: `Maximum stake is ${maxStake} STRIKER` };

  // Validate contract duration
  const availableDurations = (await getConfig("trading_available_durations") ?? "30,60,300,900")
    .split(",")
    .map((d) => parseInt(d.trim(), 10))
    .filter((d) => !isNaN(d));

  if (!availableDurations.includes(contractDurationSecs)) {
    return { success: false, error: `Invalid contract duration. Allowed: ${availableDurations.join(", ")} seconds` };
  }

  // Snapshot current price
  const entryPrice = getPrice(assetSymbol.toUpperCase());
  if (entryPrice === null) {
    return { success: false, error: "Price feed not ready — please try again in a moment" };
  }

  // Check and deduct player balance atomically
  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
  if (!player) return { success: false, error: "Player not found" };

  const balance = parseFloat(String(player.strikerBalance));
  if (balance < stakeStriker) {
    return { success: false, error: `Insufficient STRIKER balance (you have ${balance.toFixed(0)})` };
  }

  // Read player's current win streak to apply payout boost
  let currentStreak = 0;
  try {
    const r = await pool.query<{ trading_win_streak: number }>(
      `SELECT COALESCE(trading_win_streak, 0) AS trading_win_streak FROM players WHERE id = $1`,
      [playerId],
    );
    currentStreak = Number(r.rows[0]?.trading_win_streak ?? 0);
  } catch {
    // Non-fatal
  }

  const baseRatio = parseFloat(String(asset.payoutRatio));
  const boost = streakBoost(currentStreak);
  const payoutRatio = boost > 0 ? parseFloat(Math.min(1.95, baseRatio + baseRatio * boost).toFixed(4)) : baseRatio;
  const expiresAt = new Date(Date.now() + contractDurationSecs * 1_000);

  const [position] = await db.transaction(async (tx) => {
    await tx
      .update(playersTable)
      .set({
        strikerBalance: sql`${playersTable.strikerBalance} - ${stakeStriker}`,
        lastActive: new Date(),
      })
      .where(eq(playersTable.id, playerId));

    await tx.insert(transactionsTable).values({
      playerId,
      type: "bet",
      amountStriker: -stakeStriker,
      status: "completed",
    });

    return await tx
      .insert(tradingPositionsTable)
      .values({
        playerId,
        assetSymbol: assetSymbol.toUpperCase(),
        direction: direction.toUpperCase() as "UP" | "DOWN",
        stakeStriker,
        entryPrice,
        payoutRatio,
        contractDurationSecs,
        expiresAt,
        outcome: "pending",
      })
      .returning();
  });

  return { success: true, positionId: position.id, entryPrice, expiresAt };
}

// ─── Asset listing ─────────────────────────────────────────────────────────────

export async function getEnabledAssets() {
  return db
    .select()
    .from(tradingAssetsTable)
    .where(eq(tradingAssetsTable.enabled, true))
    .orderBy(tradingAssetsTable.sortOrder);
}
