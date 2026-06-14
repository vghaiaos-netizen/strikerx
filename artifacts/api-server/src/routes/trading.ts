import { Router } from "express";
import { requireAuth } from "../lib/auth";
import { openPosition, getEnabledAssets } from "../lib/tradingEngine";
import { getPrice, getAllPrices } from "../lib/binanceFeed";
import { db, tradingPositionsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

// ── GET /api/trading/assets ──────────────────────────────────────────────────
// List all enabled trading pairs with current prices
router.get("/trading/assets", async (_req, res): Promise<void> => {
  try {
    const assets = await getEnabledAssets();
    const prices = getAllPrices();
    res.json({
      assets: assets.map((a) => ({
        symbol: a.symbol,
        displayName: a.displayName,
        binanceSymbol: a.binanceSymbol,
        payoutRatio: parseFloat(String(a.payoutRatio)),
        minStakeStriker: parseFloat(String(a.minStakeStriker)),
        maxStakeStriker: parseFloat(String(a.maxStakeStriker)),
        currentPrice: prices[a.symbol] ?? null,
      })),
    });
  } catch (err) {
    logger.error({ err }, "GET /trading/assets failed");
    res.status(500).json({ error: "Failed to fetch assets" });
  }
});

// ── GET /api/trading/prices ──────────────────────────────────────────────────
// Current Binance prices for all subscribed symbols
router.get("/trading/prices", (_req, res): void => {
  res.json({ prices: getAllPrices(), at: Date.now() });
});

// ── POST /api/trading/positions ──────────────────────────────────────────────
// Open a new binary trading position
router.post("/trading/positions", requireAuth, async (req, res): Promise<void> => {
  const { assetSymbol, direction, stakeStriker, contractDurationSecs } = req.body ?? {};

  if (typeof assetSymbol !== "string" || assetSymbol.length < 2 || assetSymbol.length > 10) {
    res.status(400).json({ error: "Invalid assetSymbol" }); return;
  }
  if (direction !== "UP" && direction !== "DOWN") {
    res.status(400).json({ error: "direction must be UP or DOWN" }); return;
  }
  if (typeof stakeStriker !== "number" || stakeStriker <= 0) {
    res.status(400).json({ error: "stakeStriker must be a positive number" }); return;
  }
  if (typeof contractDurationSecs !== "number" || !Number.isInteger(contractDurationSecs) || contractDurationSecs <= 0) {
    res.status(400).json({ error: "contractDurationSecs must be a positive integer" }); return;
  }

  try {
    const normalizedSymbol = assetSymbol.toUpperCase();
    const playerId = (req as any).user.playerId as number;

    const result = await openPosition({ playerId, assetSymbol: normalizedSymbol, direction, stakeStriker, contractDurationSecs });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    req.log.info({ playerId, assetSymbol, direction, stakeStriker, positionId: result.positionId }, "Trade opened");
    res.status(201).json({
      positionId: result.positionId,
      entryPrice: result.entryPrice,
      expiresAt: result.expiresAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "POST /trading/positions failed");
    res.status(500).json({ error: "Failed to open position" });
  }
});

// ── GET /api/trading/positions/active ───────────────────────────────────────
// Just pending (open) positions for the current player
// NOTE: must be declared BEFORE /trading/positions/:id so Express doesn't match "active" as an id
router.get("/trading/positions/active", requireAuth, async (req, res): Promise<void> => {
  try {
    const playerId = (req as any).user.playerId as number;
    const positions = await db
      .select()
      .from(tradingPositionsTable)
      .where(and(
        eq(tradingPositionsTable.playerId, playerId),
        eq(tradingPositionsTable.outcome, "pending"),
      ))
      .orderBy(desc(tradingPositionsTable.expiresAt));

    res.json({
      positions: positions.map((p) => ({
        id: p.id,
        assetSymbol: p.assetSymbol,
        direction: p.direction,
        stakeStriker: parseFloat(String(p.stakeStriker)),
        entryPrice: parseFloat(String(p.entryPrice)),
        payoutRatio: parseFloat(String(p.payoutRatio)),
        contractDurationSecs: p.contractDurationSecs,
        expiresAt: p.expiresAt.toISOString(),
        createdAt: p.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    logger.error({ err }, "GET /trading/positions/active failed");
    res.status(500).json({ error: "Failed to fetch active positions" });
  }
});

// ── GET /api/trading/positions ──────────────────────────────────────────────
// Player's recent positions (last 50, all outcomes)
router.get("/trading/positions", requireAuth, async (req, res): Promise<void> => {
  try {
    const playerId = (req as any).user.playerId as number;
    const positions = await db
      .select()
      .from(tradingPositionsTable)
      .where(eq(tradingPositionsTable.playerId, playerId))
      .orderBy(desc(tradingPositionsTable.createdAt))
      .limit(50);

    res.json({
      positions: positions.map((p) => ({
        id: p.id,
        assetSymbol: p.assetSymbol,
        direction: p.direction,
        stakeStriker: parseFloat(String(p.stakeStriker)),
        entryPrice: parseFloat(String(p.entryPrice)),
        exitPrice: p.exitPrice !== null ? parseFloat(String(p.exitPrice)) : null,
        payoutRatio: parseFloat(String(p.payoutRatio)),
        winAmount: parseFloat(String(p.winAmount)),
        outcome: p.outcome,
        contractDurationSecs: p.contractDurationSecs,
        expiresAt: p.expiresAt.toISOString(),
        settledAt: p.settledAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    logger.error({ err }, "GET /trading/positions failed");
    res.status(500).json({ error: "Failed to fetch positions" });
  }
});

// ── GET /api/trading/positions/:id ──────────────────────────────────────────
router.get("/trading/positions/:id", requireAuth, async (req, res): Promise<void> => {
  const positionId = parseInt(req.params.id, 10);
  if (isNaN(positionId)) { res.status(400).json({ error: "Invalid position ID" }); return; }

  try {
    const playerId = (req as any).user.playerId as number;
    const [position] = await db
      .select()
      .from(tradingPositionsTable)
      .where(and(eq(tradingPositionsTable.id, positionId), eq(tradingPositionsTable.playerId, playerId)));

    if (!position) { res.status(404).json({ error: "Position not found" }); return; }

    res.json({
      id: position.id,
      assetSymbol: position.assetSymbol,
      direction: position.direction,
      stakeStriker: parseFloat(String(position.stakeStriker)),
      entryPrice: parseFloat(String(position.entryPrice)),
      exitPrice: position.exitPrice !== null ? parseFloat(String(position.exitPrice)) : null,
      payoutRatio: parseFloat(String(position.payoutRatio)),
      winAmount: parseFloat(String(position.winAmount)),
      outcome: position.outcome,
      contractDurationSecs: position.contractDurationSecs,
      expiresAt: position.expiresAt.toISOString(),
      settledAt: position.settledAt?.toISOString() ?? null,
      createdAt: position.createdAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "GET /trading/positions/:id failed");
    res.status(500).json({ error: "Failed to fetch position" });
  }
});

export default router;
