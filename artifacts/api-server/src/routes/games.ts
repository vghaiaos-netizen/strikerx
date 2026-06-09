import { Router, type IRouter } from "express";
import { db, playersTable, gamesTable, minefieldSessionsTable, jackpotTable, transactionsTable, crashRoundsTable } from "@workspace/db";
import { eq, desc, count, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import {
  playPenalty,
  generateMinePositions,
  minefieldMultiplier,
  playFreekick,
  calculateJackpotContribution,
  shouldTriggerJackpot,
  getVipTier,
  calculateBootEarned,
} from "../lib/gameEngine";
import { crashEngine } from "../lib/crashEngine";
import { broadcastBigWin, broadcastJackpot } from "../lib/groupBot";
import { broadcastToAll } from "../lib/wsServer";
import { logger } from "../lib/logger";
import { checkAndAward, ACHIEVEMENT_MAP } from "../lib/achievementsService";
import { sendJackpotWin, sendAchievementUnlocked } from "../services/telegramNotify";
import { getMatchEventBonus } from "../lib/matchEventBonus";
import { creditAffiliateCommission } from "../lib/affiliateCommission";

const router: IRouter = Router();

// ─── Helper: check & trigger jackpot ─────────────────────────────────────────

async function checkAndTriggerJackpot(playerId: number, betStriker: number, username: string, telegramId?: string | null) {
  const [jackpot] = await db.select().from(jackpotTable).limit(1);
  if (!jackpot || jackpot.status !== "ready") return null;
  if (!shouldTriggerJackpot(jackpot.currentAmountTon, betStriker)) return null;

  const winnerAmount = jackpot.currentAmountTon * 0.9;
  const seedAmount = parseFloat(process.env.JACKPOT_SEED_AMOUNT ?? "10");
  const strikerWin = winnerAmount * parseFloat(process.env.STRIKER_DEPOSIT_RATE ?? "100");

  await db.update(jackpotTable).set({
    currentAmountTon: seedAmount,
    status: "building",
    lastTriggeredAt: new Date(),
    lastWinnerId: playerId,
    lastWinnerUsername: username,
  }).where(eq(jackpotTable.id, jackpot.id));

  await db.update(playersTable).set({ strikerBalance: sql`${playersTable.strikerBalance} + ${strikerWin}` }).where(eq(playersTable.id, playerId));
  await db.insert(transactionsTable).values({ playerId, type: "win", amountStriker: strikerWin, amountTon: winnerAmount, status: "completed" });

  broadcastJackpot(username, winnerAmount).catch((err) => logger.error({ err }, "Failed to broadcast jackpot"));
  if (telegramId) sendJackpotWin(telegramId, winnerAmount, "StrikerX");
  return { triggered: true, amountTon: winnerAmount, strikerWin };
}

// ─── THE SHOT (crash) — WebSocket-backed ─────────────────────────────────────

// GET /games/shot/round — current round state (REST fallback for non-WS clients)
router.get("/games/shot/round", requireAuth, async (_req, res): Promise<void> => {
  const state = crashEngine.getPublicState();
  if (!state) {
    res.json({ id: 0, status: "waiting", multiplier: 1.0, crashPoint: null, startedAt: null, activePlayers: 0 });
    return;
  }
  res.json(state);
});

// POST /games/shot/bet — REST fallback (WS preferred)
router.post("/games/shot/bet", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  const { betStriker, autoCashout } = req.body as { betStriker: number; autoCashout?: number };
  if (!betStriker || betStriker <= 0) { res.status(400).json({ error: "Invalid bet" }); return; }

  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  const result = await crashEngine.placeBet(playerId, player.username, betStriker, autoCashout ?? null);
  if (!result.success) { res.status(400).json({ error: result.error }); return; }

  res.json({ roundId: result.roundId, betStriker, status: "placed", newBalance: player.strikerBalance - betStriker });
});

// POST /games/shot/:id/cashout — REST fallback (WS preferred)
router.post("/games/shot/:id/cashout", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  const result = await crashEngine.performCashout(playerId);
  if (!result.success) { res.status(400).json({ error: result.error }); return; }
  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
  res.json({
    gameId: 0,
    gameType: "shot",
    betStriker: 0,
    outcome: "cashout",
    multiplier: result.multiplier ?? 0,
    winAmount: result.winAmount ?? 0,
    newBalance: player?.strikerBalance ?? 0,
    jackpotTriggered: false,
    jackpotAmount: null,
  });
});

// ─── PENALTY ─────────────────────────────────────────────────────────────────

router.post("/games/penalty", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  const { betStriker, direction } = req.body as { betStriker: number; direction: "left" | "center" | "right" };

  if (!betStriker || betStriker <= 0 || !["left", "center", "right"].includes(direction)) {
    res.status(400).json({ error: "Invalid bet or direction" }); return;
  }

  const [precheck] = await db.select({ isBanned: playersTable.isBanned }).from(playersTable).where(eq(playersTable.id, playerId));
  if (!precheck) { res.status(404).json({ error: "Player not found" }); return; }
  if (precheck.isBanned) { res.status(403).json({ error: "Banned" }); return; }

  // Atomic deduction: only succeeds if balance >= betStriker at the DB level (race-safe)
  const depositRate = parseFloat(process.env.STRIKER_DEPOSIT_RATE ?? "100");
  const betTon = betStriker / depositRate;
  const jackpotContrib = calculateJackpotContribution(betStriker);
  const [player] = await db.update(playersTable).set({
    strikerBalance: sql`${playersTable.strikerBalance} - ${betStriker}`,
    strikerWageredSinceBonus: sql`${playersTable.strikerWageredSinceBonus} + ${betStriker}`,
    tonWageredLifetime: sql`${playersTable.tonWageredLifetime} + ${betTon}`,
    vipTier: sql`CASE WHEN ${playersTable.tonWageredLifetime} + ${betTon} >= 100 THEN 'world_cup' WHEN ${playersTable.tonWageredLifetime} + ${betTon} >= 50 THEN 'champions_league' WHEN ${playersTable.tonWageredLifetime} + ${betTon} >= 20 THEN 'premier_league' WHEN ${playersTable.tonWageredLifetime} + ${betTon} >= 5 THEN 'division_one' ELSE 'amateur' END`,
    bootBalance: sql`${playersTable.bootBalance} + ${calculateBootEarned(betStriker)}`,
    lastActive: new Date(),
  }).where(sql`${playersTable.id} = ${playerId} AND ${playersTable.strikerBalance} >= ${betStriker}`).returning();

  if (!player) { res.status(400).json({ error: "Insufficient balance" }); return; }

  const newTonWagered = parseFloat(String(player.tonWageredLifetime));
  const [jackpot] = await db.select().from(jackpotTable).limit(1);
  if (jackpot) {
    await db.update(jackpotTable).set({
      currentAmountTon: jackpot.currentAmountTon + jackpotContrib,
      status: jackpot.currentAmountTon + jackpotContrib >= parseFloat(process.env.JACKPOT_MIN_POOL ?? "50") ? "ready" : "building",
    }).where(eq(jackpotTable.id, jackpot.id));
  }

  await db.insert(transactionsTable).values({ playerId, type: "bet", amountStriker: -betStriker, amountTon: -betTon, status: "completed" });

  const { keeperDirection, win, multiplier } = playPenalty(direction);
  const matchBonus = await getMatchEventBonus();
  const winAmount = win ? parseFloat((betStriker * multiplier * matchBonus).toFixed(2)) : 0;
  const outcome = win ? "win" : "loss";
  // player.strikerBalance is already post-deduction (from atomic UPDATE RETURNING)
  const newBalance = parseFloat(String(player.strikerBalance));

  if (win) {
    await db.update(playersTable).set({ strikerBalance: sql`${playersTable.strikerBalance} + ${winAmount}` }).where(eq(playersTable.id, playerId));
    await db.insert(transactionsTable).values({ playerId, type: "win", amountStriker: winAmount, status: "completed" });
    creditAffiliateCommission(playerId, winAmount).catch(() => {});
  }

  const [game] = await db.insert(gamesTable).values({
    playerId, gameType: "penalty", betStriker,
    resultMultiplier: win ? multiplier : 0, winAmount, outcome,
    gameData: { keeperDirection, direction },
  }).returning();

  const jackpotResult = await checkAndTriggerJackpot(playerId, betStriker, player.username, player.telegramId);
  const bigWinThreshold = parseFloat(process.env.BIG_WIN_ANNOUNCE_THRESHOLD ?? "50");
  if (win && (winAmount >= bigWinThreshold || multiplier >= 5)) {
    broadcastBigWin(player.username, betStriker, winAmount, "Penalty").catch(() => {});
    broadcastToAll("big_win", { username: player.username, game: "Penalty", betStriker, winAmount, multiplier, at: Date.now() });
  }

  // fire-and-forget achievement checks
  const _playerTelegramIdPenalty = player.telegramId;
  const _playerUsernamePenalty = player.username;
  (async () => {
    const [{ value: totalGames }] = await db.select({ value: count() }).from(gamesTable).where(eq(gamesTable.playerId, playerId));
    const awarded: string[] = [];
    awarded.push(...await checkAndAward(playerId, { event: "bet_placed", totalGames: Number(totalGames), tonWageredLifetime: newTonWagered }));
    awarded.push(...await checkAndAward(playerId, { event: "game_result", gameType: "penalty", outcome, winAmount, multiplier: win ? multiplier : 0 }));
    if (jackpotResult) awarded.push(...await checkAndAward(playerId, { event: "jackpot_won" }));
    if (awarded.length > 0) {
      broadcastToAll("achievement_unlocked", { playerId, username: _playerUsernamePenalty, keys: awarded, at: Date.now() });
      if (_playerTelegramIdPenalty) {
        for (const key of awarded) {
          const def = ACHIEVEMENT_MAP[key];
          if (def) sendAchievementUnlocked(_playerTelegramIdPenalty, def.title, def.rarity);
        }
      }
    }
  })().catch(() => {});

  res.json({
    gameId: game.id, gameType: "penalty", betStriker, outcome,
    multiplier: win ? multiplier : 0, winAmount,
    newBalance: win ? newBalance + winAmount : newBalance,
    jackpotTriggered: !!jackpotResult, jackpotAmount: jackpotResult?.amountTon ?? null,
  });
});

// ─── MINEFIELD ────────────────────────────────────────────────────────────────

router.post("/games/minefield/start", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  const { betStriker, gridSize = 5, mineCount = 5 } = req.body as { betStriker: number; gridSize: number; mineCount: number };
  const totalSquares = gridSize * gridSize;
  if (!betStriker || betStriker <= 0 || gridSize < 3 || gridSize > 7 || mineCount < 1 || mineCount >= totalSquares - 1) {
    res.status(400).json({ error: "Invalid parameters" }); return;
  }

  // Expire any lingering active session (player abandoned without cashing out)
  await db.update(minefieldSessionsTable)
    .set({ status: "lost" })
    .where(eq(minefieldSessionsTable.playerId, playerId));

  // Atomic deduction: only succeeds if balance >= betStriker at the DB level (race-safe)
  const depositRate = parseFloat(process.env.STRIKER_DEPOSIT_RATE ?? "100");
  const betTon = betStriker / depositRate;
  const jackpotContrib = calculateJackpotContribution(betStriker);
  const [player] = await db.update(playersTable).set({
    strikerBalance: sql`${playersTable.strikerBalance} - ${betStriker}`,
    strikerWageredSinceBonus: sql`${playersTable.strikerWageredSinceBonus} + ${betStriker}`,
    tonWageredLifetime: sql`${playersTable.tonWageredLifetime} + ${betTon}`,
    vipTier: sql`CASE WHEN ${playersTable.tonWageredLifetime} + ${betTon} >= 100 THEN 'world_cup' WHEN ${playersTable.tonWageredLifetime} + ${betTon} >= 50 THEN 'champions_league' WHEN ${playersTable.tonWageredLifetime} + ${betTon} >= 20 THEN 'premier_league' WHEN ${playersTable.tonWageredLifetime} + ${betTon} >= 5 THEN 'division_one' ELSE 'amateur' END`,
    bootBalance: sql`${playersTable.bootBalance} + ${calculateBootEarned(betStriker)}`,
  }).where(sql`${playersTable.id} = ${playerId} AND ${playersTable.strikerBalance} >= ${betStriker}`).returning();

  if (!player) { res.status(400).json({ error: "Insufficient balance" }); return; }

  const newTonWagered = parseFloat(String(player.tonWageredLifetime));
  const [jackpot] = await db.select().from(jackpotTable).limit(1);
  if (jackpot) {
    await db.update(jackpotTable).set({
      currentAmountTon: jackpot.currentAmountTon + jackpotContrib,
      status: jackpot.currentAmountTon + jackpotContrib >= parseFloat(process.env.JACKPOT_MIN_POOL ?? "50") ? "ready" : "building",
    }).where(eq(jackpotTable.id, jackpot.id));
  }

  await db.insert(transactionsTable).values({ playerId, type: "bet", amountStriker: -betStriker, amountTon: -betTon, status: "completed" });

  const minePositions = generateMinePositions(gridSize, mineCount);
  const [session] = await db.insert(minefieldSessionsTable).values({ playerId, betStriker, gridSize, mineCount, minePositions, revealedPositions: [] }).returning();

  res.json({ id: session.id, gridSize, mineCount, revealedPositions: [], minePositions: null, status: "active", currentMultiplier: 1.0, betStriker, winAmount: null });
});

router.post("/games/minefield/:id/pick", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  const sessionId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { position } = req.body as { position: number };

  const [session] = await db.select().from(minefieldSessionsTable).where(eq(minefieldSessionsTable.id, sessionId));
  if (!session || session.playerId !== playerId || session.status !== "active") {
    res.status(404).json({ error: "Session not found or ended" }); return;
  }

  const totalSquares = session.gridSize * session.gridSize;
  if (position < 0 || position >= totalSquares || session.revealedPositions.includes(position)) {
    res.status(400).json({ error: "Invalid position" }); return;
  }

  const hitMine = session.minePositions.includes(position);
  const newRevealed = [...session.revealedPositions, position];

  if (hitMine) {
    await db.update(minefieldSessionsTable).set({ status: "lost", revealedPositions: newRevealed }).where(eq(minefieldSessionsTable.id, sessionId));
    await db.insert(gamesTable).values({ playerId, gameType: "minefield", betStriker: session.betStriker, resultMultiplier: 0, winAmount: 0, outcome: "loss", gameData: { gridSize: session.gridSize, mineCount: session.mineCount } });
    res.json({ id: session.id, gridSize: session.gridSize, mineCount: session.mineCount, revealedPositions: newRevealed, minePositions: session.minePositions, status: "lost", currentMultiplier: 0, betStriker: session.betStriker, winAmount: 0 });
    return;
  }

  const newMultiplier = minefieldMultiplier(session.gridSize, session.mineCount, newRevealed.length);
  await db.update(minefieldSessionsTable).set({ revealedPositions: newRevealed, currentMultiplier: newMultiplier }).where(eq(minefieldSessionsTable.id, sessionId));
  res.json({ id: session.id, gridSize: session.gridSize, mineCount: session.mineCount, revealedPositions: newRevealed, minePositions: null, status: "active", currentMultiplier: newMultiplier, betStriker: session.betStriker, winAmount: null });
});

router.post("/games/minefield/:id/cashout", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  const sessionId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  const [session] = await db.select().from(minefieldSessionsTable).where(eq(minefieldSessionsTable.id, sessionId));
  if (!session || session.playerId !== playerId || session.status !== "active") {
    res.status(404).json({ error: "Session not found or ended" }); return;
  }
  if (session.revealedPositions.length === 0) {
    res.status(400).json({ error: "Pick at least one square first" }); return;
  }

  const matchBonus = await getMatchEventBonus();
  const winAmount = parseFloat((session.betStriker * session.currentMultiplier * matchBonus).toFixed(2));
  await db.update(minefieldSessionsTable).set({ status: "won" }).where(eq(minefieldSessionsTable.id, sessionId));

  // Atomic credit — avoids stale-read race if two cashout requests arrive simultaneously
  await db.update(playersTable)
    .set({ strikerBalance: sql`${playersTable.strikerBalance} + ${winAmount}` })
    .where(eq(playersTable.id, playerId));
  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
  await db.insert(transactionsTable).values({ playerId, type: "win", amountStriker: winAmount, status: "completed" });
  creditAffiliateCommission(playerId, winAmount).catch(() => {});
  await db.insert(gamesTable).values({ playerId, gameType: "minefield", betStriker: session.betStriker, resultMultiplier: session.currentMultiplier, winAmount, outcome: "cashout", gameData: { gridSize: session.gridSize, mineCount: session.mineCount, safePicks: session.revealedPositions.length } });

  const jackpotResult = await checkAndTriggerJackpot(playerId, session.betStriker, player?.username ?? "Player", player?.telegramId);

  const bigWinThreshold = parseFloat(process.env.BIG_WIN_ANNOUNCE_THRESHOLD ?? "50");
  if (winAmount >= bigWinThreshold || session.currentMultiplier >= 5) {
    broadcastBigWin(player?.username ?? "Player", session.betStriker, winAmount, "Minefield").catch(() => {});
    broadcastToAll("big_win", { username: player?.username ?? "Player", game: "Minefield", betStriker: session.betStriker, winAmount, multiplier: session.currentMultiplier, at: Date.now() });
  }

  // fire-and-forget achievement checks
  const _playerTelegramIdMine = player?.telegramId ?? null;
  const _playerUsernameMine = player?.username ?? "Player";
  (async () => {
    const [{ value: totalGames }] = await db.select({ value: count() }).from(gamesTable).where(eq(gamesTable.playerId, playerId));
    const awarded: string[] = [];
    awarded.push(...await checkAndAward(playerId, { event: "bet_placed", totalGames: Number(totalGames) }));
    awarded.push(...await checkAndAward(playerId, { event: "game_result", gameType: "minefield", outcome: "cashout", winAmount, multiplier: session.currentMultiplier, safePickCount: session.revealedPositions.length }));
    if (jackpotResult) awarded.push(...await checkAndAward(playerId, { event: "jackpot_won" }));
    if (awarded.length > 0) {
      broadcastToAll("achievement_unlocked", { playerId, username: _playerUsernameMine, keys: awarded, at: Date.now() });
      if (_playerTelegramIdMine) {
        for (const key of awarded) {
          const def = ACHIEVEMENT_MAP[key];
          if (def) sendAchievementUnlocked(_playerTelegramIdMine, def.title, def.rarity);
        }
      }
    }
  })().catch(() => {});

  res.json({ gameId: sessionId, gameType: "minefield", betStriker: session.betStriker, outcome: "cashout", multiplier: session.currentMultiplier, winAmount, newBalance: (player?.strikerBalance ?? 0) + winAmount, jackpotTriggered: !!jackpotResult, jackpotAmount: jackpotResult?.amountTon ?? null });
});

// ─── FREE KICK (PLINKO) ───────────────────────────────────────────────────────

router.post("/games/freekick", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  const { betStriker, riskLevel } = req.body as { betStriker: number; riskLevel: "low" | "medium" | "high" };

  if (!betStriker || betStriker <= 0 || !riskLevel || !["low", "medium", "high"].includes(riskLevel)) {
    res.status(400).json({ error: "Invalid bet or risk level. riskLevel must be low, medium, or high" }); return;
  }

  const [precheck] = await db.select({ isBanned: playersTable.isBanned }).from(playersTable).where(eq(playersTable.id, playerId));
  if (!precheck) { res.status(404).json({ error: "Player not found" }); return; }

  // Atomic deduction: only succeeds if balance >= betStriker at the DB level (race-safe)
  const depositRate = parseFloat(process.env.STRIKER_DEPOSIT_RATE ?? "100");
  const betTon = betStriker / depositRate;
  const jackpotContrib = calculateJackpotContribution(betStriker);
  const [player] = await db.update(playersTable).set({
    strikerBalance: sql`${playersTable.strikerBalance} - ${betStriker}`,
    strikerWageredSinceBonus: sql`${playersTable.strikerWageredSinceBonus} + ${betStriker}`,
    tonWageredLifetime: sql`${playersTable.tonWageredLifetime} + ${betTon}`,
    vipTier: sql`CASE WHEN ${playersTable.tonWageredLifetime} + ${betTon} >= 100 THEN 'world_cup' WHEN ${playersTable.tonWageredLifetime} + ${betTon} >= 50 THEN 'champions_league' WHEN ${playersTable.tonWageredLifetime} + ${betTon} >= 20 THEN 'premier_league' WHEN ${playersTable.tonWageredLifetime} + ${betTon} >= 5 THEN 'division_one' ELSE 'amateur' END`,
    bootBalance: sql`${playersTable.bootBalance} + ${calculateBootEarned(betStriker)}`,
    lastActive: new Date(),
  }).where(sql`${playersTable.id} = ${playerId} AND ${playersTable.strikerBalance} >= ${betStriker}`).returning();

  if (!player) { res.status(400).json({ error: "Insufficient balance" }); return; }

  const newTonWagered = parseFloat(String(player.tonWageredLifetime));
  const [jackpot] = await db.select().from(jackpotTable).limit(1);
  if (jackpot) {
    await db.update(jackpotTable).set({
      currentAmountTon: jackpot.currentAmountTon + jackpotContrib,
      status: jackpot.currentAmountTon + jackpotContrib >= parseFloat(process.env.JACKPOT_MIN_POOL ?? "50") ? "ready" : "building",
    }).where(eq(jackpotTable.id, jackpot.id));
  }

  await db.insert(transactionsTable).values({ playerId, type: "bet", amountStriker: -betStriker, amountTon: -betTon, status: "completed" });

  const { slot, multiplier } = playFreekick(riskLevel);
  const matchBonus = await getMatchEventBonus();
  const winAmount = parseFloat((betStriker * multiplier * matchBonus).toFixed(2));
  const outcome = multiplier >= 1 ? "win" : "loss";
  // player.strikerBalance is already post-deduction (from atomic UPDATE RETURNING)
  const newBalance = parseFloat(String(player.strikerBalance));

  if (winAmount > 0) {
    await db.update(playersTable).set({ strikerBalance: sql`${playersTable.strikerBalance} + ${winAmount}` }).where(eq(playersTable.id, playerId));
    await db.insert(transactionsTable).values({ playerId, type: "win", amountStriker: winAmount, status: "completed" });
    creditAffiliateCommission(playerId, winAmount).catch(() => {});
  }

  const [game] = await db.insert(gamesTable).values({ playerId, gameType: "freekick", betStriker, resultMultiplier: multiplier, winAmount, outcome, gameData: { slot, riskLevel } }).returning();

  const jackpotResult = await checkAndTriggerJackpot(playerId, betStriker, player.username, player.telegramId);
  const bigWinThreshold = parseFloat(process.env.BIG_WIN_ANNOUNCE_THRESHOLD ?? "50");
  if (winAmount >= bigWinThreshold || multiplier >= 5) {
    broadcastBigWin(player.username, betStriker, winAmount, "Free Kick").catch(() => {});
    broadcastToAll("big_win", { username: player.username, game: "Free Kick", betStriker, winAmount, multiplier, at: Date.now() });
  }

  // fire-and-forget achievement checks
  const _playerTelegramIdFK = player.telegramId;
  const _playerUsernameFK = player.username;
  (async () => {
    const [{ value: totalGames }] = await db.select({ value: count() }).from(gamesTable).where(eq(gamesTable.playerId, playerId));
    const awarded: string[] = [];
    awarded.push(...await checkAndAward(playerId, { event: "bet_placed", totalGames: Number(totalGames), tonWageredLifetime: newTonWagered }));
    awarded.push(...await checkAndAward(playerId, { event: "game_result", gameType: "freekick", outcome, winAmount, multiplier }));
    if (jackpotResult) awarded.push(...await checkAndAward(playerId, { event: "jackpot_won" }));
    if (awarded.length > 0) {
      broadcastToAll("achievement_unlocked", { playerId, username: _playerUsernameFK, keys: awarded, at: Date.now() });
      if (_playerTelegramIdFK) {
        for (const key of awarded) {
          const def = ACHIEVEMENT_MAP[key];
          if (def) sendAchievementUnlocked(_playerTelegramIdFK, def.title, def.rarity);
        }
      }
    }
  })().catch(() => {});

  res.json({ gameId: game.id, gameType: "freekick", betStriker, outcome, multiplier, winAmount, newBalance: newBalance + winAmount, jackpotTriggered: !!jackpotResult, jackpotAmount: jackpotResult?.amountTon ?? null });
});

// ─── PROVABLY FAIR — round lookup ────────────────────────────────────────────

router.get("/games/rounds/:id", async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid round id" }); return; }

  const [round] = await db.select().from(crashRoundsTable).where(eq(crashRoundsTable.id, id));
  if (!round) { res.status(404).json({ error: "Round not found" }); return; }

  // Only reveal serverSeed after round has crashed (provably fair)
  res.json({
    id: round.id,
    status: round.status,
    crashPoint: round.status === "crashed" ? round.crashPoint : null,
    serverSeed: round.status === "crashed" ? round.serverSeed : null,
    startedAt: round.startedAt?.toISOString() ?? null,
    endedAt: round.endedAt?.toISOString() ?? null,
    createdAt: round.createdAt.toISOString(),
  });
});

// ─── HISTORY ─────────────────────────────────────────────────────────────────

router.get("/games/history", requireAuth, async (req, res): Promise<void> => {
  const { playerId } = req.player!;
  const limit = parseInt(String(req.query.limit ?? 20));
  const games = await db.select().from(gamesTable).where(eq(gamesTable.playerId, playerId)).orderBy(desc(gamesTable.createdAt)).limit(limit);
  res.json(games.map((g) => ({ id: g.id, gameType: g.gameType, betStriker: g.betStriker, outcome: g.outcome, multiplier: g.resultMultiplier, winAmount: g.winAmount, createdAt: g.createdAt.toISOString() })));
});

export default router;
