import crypto from "crypto";
import { db, crashRoundsTable, gamesTable, playersTable, transactionsTable, jackpotTable } from "@workspace/db";
import { eq, count, sql } from "drizzle-orm";
import { checkAndAward } from "./achievementsService";
import { logger } from "./logger";
import { broadcastBigWin, broadcastJackpot } from "./groupBot";
import { sendJackpotWin } from "../services/telegramNotify";
import {
  generateCrashPoint,
  generateServerSeed,
  calculateJackpotContribution,
  shouldTriggerJackpot,
  getVipTier,
  calculateBootEarned,
} from "./gameEngine";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CrashBet {
  playerId: number;
  username: string;
  betStriker: number;
  autoCashout: number | null;
  cashedOut: boolean;
  cashoutMultiplier: number | null;
  winAmount: number;
}

export interface RoundState {
  id: number;
  status: "waiting" | "running" | "crashed";
  multiplier: number;
  crashPoint: number;
  startedAt: Date | null;
  bets: Map<number, CrashBet>; // playerId → bet
  serverSeed: string;
}

// ─── Crash Engine ─────────────────────────────────────────────────────────────

class CrashEngine {
  private currentRound: RoundState | null = null;
  private multiplierInterval: NodeJS.Timeout | null = null;
  private broadcastFn: ((event: string, data: unknown) => void) | null = null;

  /** Register the WebSocket broadcast callback */
  setBroadcast(fn: (event: string, data: unknown) => void) {
    this.broadcastFn = fn;
  }

  private broadcast(event: string, data: unknown) {
    if (this.broadcastFn) {
      this.broadcastFn(event, data);
    }
  }

  getRoundState(): RoundState | null {
    return this.currentRound;
  }

  getPublicState() {
    if (!this.currentRound) return null;
    return {
      id: this.currentRound.id,
      status: this.currentRound.status,
      multiplier: this.currentRound.multiplier,
      crashPoint: this.currentRound.status === "crashed" ? this.currentRound.crashPoint : null,
      startedAt: this.currentRound.startedAt?.toISOString() ?? null,
      activePlayers: this.currentRound.bets.size,
    };
  }

  async startNewRound() {
    // Create DB record
    const serverSeed = generateServerSeed();
    const crashPoint = generateCrashPoint(serverSeed);

    const [dbRound] = await db
      .insert(crashRoundsTable)
      .values({ serverSeed, crashPoint, status: "waiting" })
      .returning();

    this.currentRound = {
      id: dbRound.id,
      status: "waiting",
      multiplier: 1.0,
      crashPoint,
      startedAt: null,
      bets: new Map(),
      serverSeed,
    };

    this.broadcast("round_state", this.getPublicState());
    logger.info({ roundId: dbRound.id, crashPoint }, "Crash round waiting");

    // Wait 5 seconds before starting
    setTimeout(() => this.runRound(), 5000);
  }

  private runRound() {
    if (!this.currentRound) return;
    if (this.currentRound.bets.size === 0) {
      // No bets — start anyway for UX
    }

    this.currentRound.status = "running";
    this.currentRound.startedAt = new Date();
    this.broadcast("round_state", this.getPublicState());

    // Update DB
    db.update(crashRoundsTable)
      .set({ status: "running", startedAt: new Date() })
      .where(eq(crashRoundsTable.id, this.currentRound.id))
      .catch((err) => logger.error({ err }, "Failed to update round status"));

    logger.info({ roundId: this.currentRound.id }, "Crash round started");

    // Tick multiplier every 100ms
    let elapsed = 0;
    this.multiplierInterval = setInterval(() => {
      if (!this.currentRound || this.currentRound.status !== "running") return;

      elapsed += 100;
      // Exponential growth: multiplier = e^(0.0006 * elapsed_ms)
      const raw = Math.exp(0.0006 * elapsed);
      this.currentRound.multiplier = parseFloat(raw.toFixed(2));

      // Check auto-cashouts
      for (const [playerId, bet] of this.currentRound.bets) {
        if (!bet.cashedOut && bet.autoCashout && this.currentRound.multiplier >= bet.autoCashout) {
          this.performCashout(playerId, bet.autoCashout).catch((err) =>
            logger.error({ err }, "Auto-cashout failed")
          );
        }
      }

      // Broadcast multiplier update every 200ms (every other tick)
      if (elapsed % 200 === 0) {
        this.broadcast("multiplier", { multiplier: this.currentRound.multiplier, roundId: this.currentRound.id });
      }

      // Check crash
      if (this.currentRound.multiplier >= this.currentRound.crashPoint) {
        this.crashRound();
      }
    }, 100);
  }

  private async crashRound() {
    if (!this.currentRound || this.multiplierInterval === null) return;

    clearInterval(this.multiplierInterval);
    this.multiplierInterval = null;

    this.currentRound.status = "crashed";
    this.currentRound.multiplier = this.currentRound.crashPoint;

    // Process all remaining bets as losses
    for (const [playerId, bet] of this.currentRound.bets) {
      if (!bet.cashedOut) {
        await db.insert(gamesTable).values({
          playerId,
          gameType: "shot",
          betStriker: bet.betStriker,
          resultMultiplier: 0,
          winAmount: 0,
          outcome: "loss",
          sessionId: String(this.currentRound.id),
        }).catch(() => {});
      }
    }

    // Update DB
    await db
      .update(crashRoundsTable)
      .set({ status: "crashed", endedAt: new Date(), currentMultiplier: this.currentRound.crashPoint })
      .where(eq(crashRoundsTable.id, this.currentRound.id))
      .catch((err) => logger.error({ err }, "Failed to update crashed round"));

    this.broadcast("round_crashed", {
      roundId: this.currentRound.id,
      crashPoint: this.currentRound.crashPoint,
      multiplier: this.currentRound.crashPoint,
    });

    logger.info({ roundId: this.currentRound.id, crashPoint: this.currentRound.crashPoint }, "Crash round crashed");

    // Start next round after 3 seconds
    setTimeout(() => this.startNewRound(), 3000);
  }

  async placeBet(playerId: number, username: string, betStriker: number, autoCashout: number | null): Promise<{ success: boolean; error?: string; roundId?: number }> {
    if (!this.currentRound || this.currentRound.status !== "waiting") {
      return { success: false, error: "Round is not accepting bets right now" };
    }

    if (this.currentRound.bets.has(playerId)) {
      return { success: false, error: "Already bet on this round" };
    }

    // Deduct from player balance
    const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
    if (!player) return { success: false, error: "Player not found" };
    if (player.isBanned) return { success: false, error: "Account banned" };
    if (player.strikerBalance < betStriker) return { success: false, error: "Insufficient balance" };

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

    const depositRate = parseFloat(process.env.STRIKER_DEPOSIT_RATE ?? "100");
    const betTon = betStriker / depositRate;
    const newTonWagered = player.tonWageredLifetime + betTon;
    const newVip = getVipTier(newTonWagered);

    await db.update(playersTable).set({
      strikerBalance: player.strikerBalance - betStriker,
      strikerWageredSinceBonus: player.strikerWageredSinceBonus + betStriker,
      tonWageredLifetime: newTonWagered,
      vipTier: newVip,
      bootBalance: player.bootBalance + calculateBootEarned(betStriker),
      lastActive: new Date(),
    }).where(eq(playersTable.id, playerId));

    await db.insert(transactionsTable).values({
      playerId,
      type: "bet",
      amountStriker: -betStriker,
      amountTon: -betTon,
      status: "completed",
    });

    this.currentRound.bets.set(playerId, {
      playerId,
      username,
      betStriker,
      autoCashout,
      cashedOut: false,
      cashoutMultiplier: null,
      winAmount: 0,
    });

    this.broadcast("bet_placed", { playerId, username, betStriker, roundId: this.currentRound.id });

    // fire-and-forget achievement checks for bet placed
    (async () => {
      const [{ value: totalGames }] = await db.select({ value: count() }).from(gamesTable).where(eq(gamesTable.playerId, playerId));
      const awarded: string[] = [];
      awarded.push(...await checkAndAward(playerId, { event: "bet_placed", totalGames: Number(totalGames), tonWageredLifetime: newTonWagered }));
      if (newVip !== player.vipTier) {
        awarded.push(...await checkAndAward(playerId, { event: "vip_updated", vipTier: newVip }));
      }
      if (awarded.length > 0) this.broadcast("achievement_unlocked", { playerId, username, keys: awarded, at: Date.now() });
    })().catch(() => {});

    return { success: true, roundId: this.currentRound.id };
  }

  async performCashout(playerId: number, multiplier?: number): Promise<{ success: boolean; error?: string; winAmount?: number; multiplier?: number }> {
    if (!this.currentRound || this.currentRound.status !== "running") {
      return { success: false, error: "Round is not running" };
    }

    const bet = this.currentRound.bets.get(playerId);
    if (!bet) return { success: false, error: "No bet found for this round" };
    if (bet.cashedOut) return { success: false, error: "Already cashed out" };

    const cashoutMult = multiplier ?? this.currentRound.multiplier;
    const winAmount = parseFloat((bet.betStriker * cashoutMult).toFixed(2));

    bet.cashedOut = true;
    bet.cashoutMultiplier = cashoutMult;
    bet.winAmount = winAmount;

    // Credit player
    const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
    if (player) {
      await db.update(playersTable).set({ strikerBalance: player.strikerBalance + winAmount }).where(eq(playersTable.id, playerId));
    }

    await db.insert(transactionsTable).values({ playerId, type: "win", amountStriker: winAmount, status: "completed" });
    await db.insert(gamesTable).values({
      playerId,
      gameType: "shot",
      betStriker: bet.betStriker,
      resultMultiplier: cashoutMult,
      winAmount,
      outcome: "cashout",
      sessionId: String(this.currentRound.id),
    });

    this.broadcast("player_cashout", { playerId, username: bet.username, multiplier: cashoutMult, winAmount, roundId: this.currentRound.id });

    // Big win announcement
    const bigWinThreshold = parseFloat(process.env.BIG_WIN_ANNOUNCE_THRESHOLD ?? "50");
    if (winAmount >= bigWinThreshold || cashoutMult >= 5) {
      broadcastBigWin(bet.username, bet.betStriker, winAmount, "The Shot").catch(() => {});
      this.broadcast("big_win", {
        username: bet.username,
        game: "The Shot",
        betStriker: bet.betStriker,
        winAmount,
        multiplier: cashoutMult,
        at: Date.now(),
      });
    }

    // Jackpot check — fire-and-forget
    (async () => {
      const [currentJackpot] = await db.select().from(jackpotTable).limit(1);
      if (!currentJackpot || currentJackpot.status !== "ready") return;
      if (!shouldTriggerJackpot(currentJackpot.currentAmountTon, bet.betStriker)) return;

      const winnerAmountTon = currentJackpot.currentAmountTon * 0.9;
      const seedAmount      = parseFloat(process.env.JACKPOT_SEED_AMOUNT ?? "10");
      const depositRate     = parseFloat(process.env.STRIKER_DEPOSIT_RATE ?? "100");
      const strikerWin      = Math.round(winnerAmountTon * depositRate);

      await db.update(jackpotTable).set({
        currentAmountTon: seedAmount,
        status: "building",
        lastTriggeredAt: new Date(),
        lastWinnerId: playerId,
        lastWinnerUsername: bet.username,
      }).where(eq(jackpotTable.id, currentJackpot.id));

      // Credit STRIKER jackpot winnings + 1 CAPTAIN token atomically
      await db.update(playersTable).set({
        strikerBalance:  sql`${playersTable.strikerBalance}  + ${strikerWin}`,
        captainBalance:  sql`${playersTable.captainBalance}  + 1`,
      }).where(eq(playersTable.id, playerId));

      await db.insert(transactionsTable).values({ playerId, type: "win",           amountStriker: strikerWin,   amountTon: winnerAmountTon, status: "completed" });
      await db.insert(transactionsTable).values({ playerId, type: "captain_award", captainAmount: 1,            status: "completed" });

      broadcastJackpot(bet.username, winnerAmountTon).catch(() => {});
      this.broadcast("jackpot_won", { playerId, username: bet.username, amountTon: winnerAmountTon, strikerWin, at: Date.now() });

      // Telegram push + achievement
      if (player?.telegramId) sendJackpotWin(player.telegramId, strikerWin, "The Shot");
      checkAndAward(playerId, { event: "jackpot_won" }).catch(() => {});
      logger.info({ playerId, amountTon: winnerAmountTon, strikerWin }, "Shot jackpot triggered");
    })().catch((err) => logger.error({ err }, "Shot jackpot check failed"));

    // fire-and-forget achievement checks for Shot cashout
    (async () => {
      const [{ value: totalGames }] = await db.select({ value: count() }).from(gamesTable).where(eq(gamesTable.playerId, playerId));
      const awarded: string[] = [];
      awarded.push(...await checkAndAward(playerId, { event: "bet_placed", totalGames: Number(totalGames) }));
      awarded.push(...await checkAndAward(playerId, { event: "game_result", gameType: "shot", outcome: "cashout", winAmount, multiplier: cashoutMult }));
      if (awarded.length > 0) this.broadcast("achievement_unlocked", { playerId, username: bet.username, keys: awarded, at: Date.now() });
    })().catch(() => {});

    return { success: true, winAmount, multiplier: cashoutMult };
  }
}

export const crashEngine = new CrashEngine();

// Start first round on module load
let started = false;
export async function startCrashEngine() {
  if (started) return;
  started = true;
  logger.info("Crash engine starting");
  await crashEngine.startNewRound();
}
