import { Router, type IRouter } from "express";
import { db, playersTable, gamesTable, crashRoundsTable, minefieldSessionsTable, jackpotTable, transactionsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import {
  generateCrashPoint,
  generateServerSeed,
  playPenalty,
  generateMinePositions,
  minefieldMultiplier,
  playFreekick,
  calculateJackpotContribution,
  shouldTriggerJackpot,
  getVipTier,
  calculateBootEarned,
  strikerToTon,
} from "../lib/gameEngine";
import { broadcastBigWin, broadcastJackpot } from "../lib/groupBot";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Helper: deduct bet, check balance, apply jackpot contribution
async function processbet(playerId: number, betStriker: number) {
  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
  if (!player) throw new Error("Player not found");
  if (player.isBanned) throw new Error("Account banned");
  if (player.strikerBalance < betStriker) throw new Error("Insufficient balance");

  // Jackpot contribution
  const jackpotContrib = calculateJackpotContribution(betStriker);
  const [jackpot] = await db.select().from(jackpotTable).limit(1);
  if (jackpot) {
    await db
      .update(jackpotTable)
      .set({
        currentAmountTon: jackpot.currentAmountTon + jackpotContrib,
        status: jackpot.currentAmountTon + jackpotContrib >= parseFloat(process.env.JACKPOT_MIN_POOL ?? "50") ? "ready" : "building",
      })
      .where(eq(jackpotTable.id, jackpot.id));
  }

  // Deduct bet
  const depositRate = parseFloat(process.env.STRIKER_DEPOSIT_RATE ?? "100");
  const betTon = betStriker / depositRate;
  const newTonWagered = player.tonWageredLifetime + betTon;
  const newVip = getVipTier(newTonWagered);
  const newBoot = player.bootBalance + calculateBootEarned(betStriker);

  await db
    .update(playersTable)
    .set({
      strikerBalance: player.strikerBalance - betStriker,
      strikerWageredSinceBonus: player.strikerWageredSinceBonus + betStriker,
      tonWageredLifetime: newTonWagered,
      vipTier: newVip,
      bootBalance: newBoot,
      lastActive: new Date(),
    })
    .where(eq(playersTable.id, playerId));

  // Record bet transaction
  await db.insert(transactionsTable).values({
    playerId,
    type: "bet",
    amountStriker: -betStriker,
    amountTon: -betTon,
    status: "completed",
  });

  return { player, jackpot, newBalance: player.strikerBalance - betStriker };
}

async function processWin(playerId: number, winAmount: number, currentBalance: number) {
  await db
    .update(playersTable)
    .set({ strikerBalance: currentBalance + winAmount })
    .where(eq(playersTable.id, playerId));
  await db.insert(transactionsTable).values({
    playerId,
    type: "win",
    amountStriker: winAmount,
    status: "completed",
  });
}

async function checkAndTriggerJackpot(playerId: number, betStriker: number, username: string) {
  const [jackpot] = await db.select().from(jackpotTable).limit(1);
  if (!jackpot || jackpot.status !== "ready") return null;

  if (!shouldTriggerJackpot(jackpot.currentAmountTon, betStriker)) return null;

  // Jackpot triggered!
  const winnerAmount = jackpot.currentAmountTon * 0.9;
  const seedAmount = parseFloat(process.env.JACKPOT_SEED_AMOUNT ?? "10");
  const strikerWin = winnerAmount * parseFloat(process.env.STRIKER_DEPOSIT_RATE ?? "100");

  await db
    .update(jackpotTable)
    .set({
      currentAmountTon: seedAmount,
      status: "building",
      lastTriggeredAt: new Date(),
      lastWinnerId: playerId,
      lastWinnerUsername: username,
    })
    .where(eq(jackpotTable.id, jackpot.id));

  await db.insert(transactionsTable).values({
    playerId,
    type: "win",
    amountStriker: strikerWin,
    amountTon: winnerAmount,
    status: "completed",
  });

  await db
    .update(playersTable)
    .set({ captainBalance: db.select().from(playersTable).where(eq(playersTable.id, playerId)) as unknown as number })
    .where(eq(playersTable.id, playerId));

  // Announce in group
  broadcastJackpot(username, winnerAmount).catch((err) => logger.error({ err }, "Failed to broadcast jackpot"));

  return { triggered: true, amountTon: winnerAmount, strikerWin };
}

// GET /games/shot/round
router.get("/games/shot/round", requireAuth, async (req, res): Promise<void> => {
  let [round] = await db
    .select()
    .from(crashRoundsTable)
    .where(eq(crashRoundsTable.status, "running"))
    .limit(1);

  if (!round) {
    // Create a new waiting round
    const seed = generateServerSeed();
    const crashPoint = generateCrashPoint(seed);
    const inserted = await db
      .insert(crashRoundsTable)
      .values({ serverSeed: seed, crashPoint, status: "waiting" })
      .returning();
    round = inserted[0];
  }

  res.json({
    id: round.id,
    status: round.status,
    multiplier: round.currentMultiplier,
    crashPoint: round.status === "crashed" ? round.crashPoint : null,
    startedAt: round.startedAt?.toISOString() ?? null,
    activePlayers: 0,
  });
});

// POST /games/shot/bet
router.post("/games/shot/bet", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  const { betStriker, autoCashout } = req.body as { betStriker: number; autoCashout?: number };

  if (!betStriker || betStriker <= 0) {
    res.status(400).json({ error: "Invalid bet amount" });
    return;
  }

  const { player, jackpot, newBalance } = await processbet(playerId, betStriker);

  // Simulate crash game — generate crash point and auto-cashout
  const serverSeed = generateServerSeed();
  const crashPoint = generateCrashPoint(serverSeed);
  const cashoutAt = autoCashout ? Math.min(autoCashout, crashPoint) : (1 + Math.random() * 2); // Random up to crash
  const didCrash = cashoutAt > crashPoint;
  const multiplier = didCrash ? 1.0 : cashoutAt;
  const outcome = didCrash ? "loss" : "cashout";
  const winAmount = didCrash ? 0 : parseFloat((betStriker * multiplier).toFixed(2));

  if (!didCrash) {
    await processWin(playerId, winAmount, newBalance);
  }

  const [game] = await db
    .insert(gamesTable)
    .values({
      playerId,
      gameType: "shot",
      betStriker,
      resultMultiplier: multiplier,
      winAmount,
      outcome,
    })
    .returning();

  // Check jackpot
  const jackpotResult = await checkAndTriggerJackpot(playerId, betStriker, player.username);

  // Announce big win
  const bigWinThreshold = parseFloat(process.env.BIG_WIN_ANNOUNCE_THRESHOLD ?? "50");
  if (winAmount >= bigWinThreshold && !didCrash) {
    broadcastBigWin(player.username, betStriker, winAmount, "The Shot").catch((err) => logger.error({ err }, "Failed to broadcast big win"));
  }

  res.json({
    gameId: game.id,
    gameType: "shot",
    betStriker,
    outcome,
    multiplier,
    winAmount,
    newBalance: didCrash ? newBalance : newBalance + winAmount,
    jackpotTriggered: !!jackpotResult,
    jackpotAmount: jackpotResult?.amountTon ?? null,
  });
});

// POST /games/shot/:id/cashout
router.post("/games/shot/:id/cashout", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const gameId = parseInt(raw, 10);
  res.status(400).json({ error: "Cashout must happen during active round" });
});

// POST /games/penalty
router.post("/games/penalty", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  const { betStriker, direction } = req.body as { betStriker: number; direction: "left" | "center" | "right" };

  if (!betStriker || betStriker <= 0 || !["left", "center", "right"].includes(direction)) {
    res.status(400).json({ error: "Invalid bet or direction" });
    return;
  }

  const { player, newBalance } = await processbet(playerId, betStriker);
  const { keeperDirection, win, multiplier } = playPenalty(direction);
  const winAmount = win ? parseFloat((betStriker * multiplier).toFixed(2)) : 0;
  const outcome = win ? "win" : "loss";

  if (win) {
    await processWin(playerId, winAmount, newBalance);
  }

  const [game] = await db
    .insert(gamesTable)
    .values({ playerId, gameType: "penalty", betStriker, resultMultiplier: win ? multiplier : 0, winAmount, outcome, gameData: { keeperDirection, direction } })
    .returning();

  const jackpotResult = await checkAndTriggerJackpot(playerId, betStriker, player.username);

  const bigWinThreshold = parseFloat(process.env.BIG_WIN_ANNOUNCE_THRESHOLD ?? "50");
  if (winAmount >= bigWinThreshold) {
    broadcastBigWin(player.username, betStriker, winAmount, "Penalty").catch((err) => logger.error({ err }, "Failed to broadcast big win"));
  }

  res.json({
    gameId: game.id,
    gameType: "penalty",
    betStriker,
    outcome,
    multiplier: win ? multiplier : 0,
    winAmount,
    newBalance: win ? newBalance + winAmount : newBalance,
    jackpotTriggered: !!jackpotResult,
    jackpotAmount: jackpotResult?.amountTon ?? null,
  });
});

// POST /games/minefield/start
router.post("/games/minefield/start", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  const { betStriker, gridSize = 5, mineCount = 5 } = req.body as { betStriker: number; gridSize: number; mineCount: number };

  const totalSquares = gridSize * gridSize;
  if (!betStriker || betStriker <= 0 || gridSize < 3 || gridSize > 7 || mineCount < 1 || mineCount >= totalSquares - 1) {
    res.status(400).json({ error: "Invalid parameters" });
    return;
  }

  const { player, newBalance } = await processbet(playerId, betStriker);
  const minePositions = generateMinePositions(gridSize, mineCount);

  const [session] = await db
    .insert(minefieldSessionsTable)
    .values({ playerId, betStriker, gridSize, mineCount, minePositions, revealedPositions: [] })
    .returning();

  res.json({
    id: session.id,
    gridSize,
    mineCount,
    revealedPositions: [],
    minePositions: null, // Hidden until game ends
    status: "active",
    currentMultiplier: 1.0,
    betStriker,
    winAmount: null,
  });
});

// POST /games/minefield/:id/pick
router.post("/games/minefield/:id/pick", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const sessionId = parseInt(raw, 10);
  const { position } = req.body as { position: number };

  const [session] = await db
    .select()
    .from(minefieldSessionsTable)
    .where(eq(minefieldSessionsTable.id, sessionId));

  if (!session || session.playerId !== playerId || session.status !== "active") {
    res.status(404).json({ error: "Session not found or already ended" });
    return;
  }

  const totalSquares = session.gridSize * session.gridSize;
  if (position < 0 || position >= totalSquares || session.revealedPositions.includes(position)) {
    res.status(400).json({ error: "Invalid position" });
    return;
  }

  const hitMine = session.minePositions.includes(position);
  const newRevealed = [...session.revealedPositions, position];

  if (hitMine) {
    // Game over
    await db
      .update(minefieldSessionsTable)
      .set({ status: "lost", revealedPositions: newRevealed })
      .where(eq(minefieldSessionsTable.id, sessionId));

    await db.insert(gamesTable).values({
      playerId,
      gameType: "minefield",
      betStriker: session.betStriker,
      resultMultiplier: 0,
      winAmount: 0,
      outcome: "loss",
      gameData: { gridSize: session.gridSize, mineCount: session.mineCount, safePicks: session.revealedPositions.length },
    });

    res.json({
      id: session.id,
      gridSize: session.gridSize,
      mineCount: session.mineCount,
      revealedPositions: newRevealed,
      minePositions: session.minePositions,
      status: "lost",
      currentMultiplier: 0,
      betStriker: session.betStriker,
      winAmount: 0,
    });
    return;
  }

  // Safe pick
  const newMultiplier = minefieldMultiplier(session.gridSize, session.mineCount, newRevealed.length);
  await db
    .update(minefieldSessionsTable)
    .set({ revealedPositions: newRevealed, currentMultiplier: newMultiplier })
    .where(eq(minefieldSessionsTable.id, sessionId));

  res.json({
    id: session.id,
    gridSize: session.gridSize,
    mineCount: session.mineCount,
    revealedPositions: newRevealed,
    minePositions: null,
    status: "active",
    currentMultiplier: newMultiplier,
    betStriker: session.betStriker,
    winAmount: null,
  });
});

// POST /games/minefield/:id/cashout
router.post("/games/minefield/:id/cashout", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const sessionId = parseInt(raw, 10);

  const [session] = await db
    .select()
    .from(minefieldSessionsTable)
    .where(eq(minefieldSessionsTable.id, sessionId));

  if (!session || session.playerId !== playerId || session.status !== "active") {
    res.status(404).json({ error: "Session not found or already ended" });
    return;
  }

  if (session.revealedPositions.length === 0) {
    res.status(400).json({ error: "Must pick at least one square before cashing out" });
    return;
  }

  const winAmount = parseFloat((session.betStriker * session.currentMultiplier).toFixed(2));

  await db
    .update(minefieldSessionsTable)
    .set({ status: "won" })
    .where(eq(minefieldSessionsTable.id, sessionId));

  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
  await processWin(playerId, winAmount, player?.strikerBalance ?? 0);

  await db.insert(gamesTable).values({
    playerId,
    gameType: "minefield",
    betStriker: session.betStriker,
    resultMultiplier: session.currentMultiplier,
    winAmount,
    outcome: "cashout",
    gameData: { gridSize: session.gridSize, mineCount: session.mineCount, safePicks: session.revealedPositions.length },
  });

  const jackpotResult = await checkAndTriggerJackpot(playerId, session.betStriker, player?.username ?? "Player");

  res.json({
    gameId: sessionId,
    gameType: "minefield",
    betStriker: session.betStriker,
    outcome: "cashout",
    multiplier: session.currentMultiplier,
    winAmount,
    newBalance: (player?.strikerBalance ?? 0) + winAmount,
    jackpotTriggered: !!jackpotResult,
    jackpotAmount: jackpotResult?.amountTon ?? null,
  });
});

// POST /games/freekick
router.post("/games/freekick", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  const { betStriker, riskLevel = "medium" } = req.body as { betStriker: number; riskLevel: "low" | "medium" | "high" };

  if (!betStriker || betStriker <= 0 || !["low", "medium", "high"].includes(riskLevel)) {
    res.status(400).json({ error: "Invalid bet or risk level" });
    return;
  }

  const { player, newBalance } = await processbet(playerId, betStriker);
  const { slot, multiplier } = playFreekick(riskLevel);
  const winAmount = parseFloat((betStriker * multiplier).toFixed(2));
  const outcome = multiplier >= 1 ? "win" : "loss";

  if (winAmount > 0) {
    await processWin(playerId, winAmount, newBalance);
  }

  const [game] = await db
    .insert(gamesTable)
    .values({ playerId, gameType: "freekick", betStriker, resultMultiplier: multiplier, winAmount, outcome, gameData: { slot, riskLevel } })
    .returning();

  const jackpotResult = await checkAndTriggerJackpot(playerId, betStriker, player.username);

  const bigWinThreshold = parseFloat(process.env.BIG_WIN_ANNOUNCE_THRESHOLD ?? "50");
  if (winAmount >= bigWinThreshold) {
    broadcastBigWin(player.username, betStriker, winAmount, "Free Kick").catch((err) => logger.error({ err }, "Failed to broadcast big win"));
  }

  res.json({
    gameId: game.id,
    gameType: "freekick",
    betStriker,
    outcome,
    multiplier,
    winAmount,
    newBalance: newBalance + winAmount,
    jackpotTriggered: !!jackpotResult,
    jackpotAmount: jackpotResult?.amountTon ?? null,
  });
});

// GET /games/history
router.get("/games/history", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  const limit = parseInt(String(req.query.limit ?? 20));

  const games = await db
    .select()
    .from(gamesTable)
    .where(eq(gamesTable.playerId, playerId))
    .orderBy(desc(gamesTable.createdAt))
    .limit(limit);

  res.json(
    games.map((g) => ({
      id: g.id,
      gameType: g.gameType,
      betStriker: g.betStriker,
      outcome: g.outcome,
      multiplier: g.resultMultiplier,
      winAmount: g.winAmount,
      createdAt: g.createdAt.toISOString(),
    }))
  );
});

export default router;
