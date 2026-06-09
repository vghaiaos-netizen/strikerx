import crypto from "crypto";
import { db, crashRoundsTable, gamesTable, playersTable, transactionsTable, jackpotTable } from "@workspace/db";
import { eq, count, sql } from "drizzle-orm";
import { checkAndAward, ACHIEVEMENT_MAP } from "./achievementsService";
import { sendAchievementUnlocked } from "../services/telegramNotify";
import { logger } from "./logger";
import { broadcastBigWin, broadcastJackpot } from "./groupBot";
import {
  generateCrashPoint,
  generateServerSeed,
  calculateJackpotContribution,
  shouldTriggerJackpot,
  getVipTier,
  calculateBootEarned,
} from "./gameEngine";
import { getMatchEventBonus } from "./matchEventBonus";
import { creditAffiliateCommission } from "./affiliateCommission";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CrashBet {
  playerId: number;
  username: string;
  telegramId: string | null;
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

    if (!betStriker || betStriker <= 0) return { success: false, error: "Invalid bet amount" };

    // Server-side max bet cap
    const maxBet = parseFloat(process.env.MAX_BET_STRIKER ?? "50000");
    if (betStriker > maxBet) return { success: false, error: `Maximum bet is ${maxBet.toLocaleString()} STRIKER` };

    // Check banned status and capture current VIP tier (cheap read)
    const [precheck] = await db.select({ isBanned: playersTable.isBanned, telegramId: playersTable.telegramId, vipTier: playersTable.vipTier })
      .from(playersTable).where(eq(playersTable.id, playerId));
    if (!precheck) return { success: false, error: "Player not found" };
    if (precheck.isBanned) return { success: false, error: "Account banned" };
    const oldVipTier = precheck.vipTier;

    // Atomic deduction — only succeeds if balance >= bet (prevents double-spend race)
    const depositRate = parseFloat(process.env.STRIKER_DEPOSIT_RATE ?? "100");
    const betTon = betStriker / depositRate;
    const jackpotContrib = calculateJackpotContribution(betStriker);
    const minPool = parseFloat(process.env.JACKPOT_MIN_POOL ?? "50");

    const [player] = await db.update(playersTable).set({
      strikerBalance: sql`${playersTable.strikerBalance} - ${betStriker}`,
      strikerWageredSinceBonus: sql`${playersTable.strikerWageredSinceBonus} + ${betStriker}`,
      tonWageredLifetime: sql`${playersTable.tonWageredLifetime} + ${betTon}`,
      vipTier: sql`CASE WHEN ${playersTable.tonWageredLifetime} + ${betTon} >= 1000 THEN 'world_cup' WHEN ${playersTable.tonWageredLifetime} + ${betTon} >= 500 THEN 'champions_league' WHEN ${playersTable.tonWageredLifetime} + ${betTon} >= 200 THEN 'premier_league' WHEN ${playersTable.tonWageredLifetime} + ${betTon} >= 50 THEN 'championship' ELSE 'sunday_league' END`,
      bootBalance: sql`${playersTable.bootBalance} + ${calculateBootEarned(betStriker)}`,
      lastActive: new Date(),
    }).where(sql`${playersTable.id} = ${playerId} AND ${playersTable.strikerBalance} >= ${betStriker}`).returning();

    if (!player) return { success: false, error: "Insufficient balance" };

    const newTonWagered = parseFloat(String(player.tonWageredLifetime));
    const newVip = getVipTier(newTonWagered);

    // Jackpot contribution — atomic increment
    await db
      .update(jackpotTable)
      .set({
        currentAmountTon: sql`${jackpotTable.currentAmountTon} + ${jackpotContrib}`,
        status: sql`CASE WHEN ${jackpotTable.currentAmountTon} + ${jackpotContrib} >= ${minPool} THEN 'ready' ELSE 'building' END`,
      });

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
      telegramId: player.telegramId ?? null,
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
      if (newVip !== oldVipTier) {
        awarded.push(...await checkAndAward(playerId, { event: "vip_updated", vipTier: newVip }));
      }
      if (awarded.length > 0) {
        this.broadcast("achievement_unlocked", { playerId, username, keys: awarded, at: Date.now() });
        if (player.telegramId) {
          for (const key of awarded) {
            const def = ACHIEVEMENT_MAP[key];
            if (def) sendAchievementUnlocked(player.telegramId, def.title, def.rarity);
          }
        }
      }
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
    const matchBonus = await getMatchEventBonus();
    const winAmount = parseFloat((bet.betStriker * cashoutMult * matchBonus).toFixed(2));

    bet.cashedOut = true;
    bet.cashoutMultiplier = cashoutMult;
    bet.winAmount = winAmount;

    // Credit player — atomic increment to avoid concurrent-cashout race
    await db
      .update(playersTable)
      .set({ strikerBalance: sql`${playersTable.strikerBalance} + ${winAmount}` })
      .where(eq(playersTable.id, playerId));

    await db.insert(transactionsTable).values({ playerId, type: "win", amountStriker: winAmount, status: "completed" });
    creditAffiliateCommission(playerId, winAmount).catch(() => {});
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

    // fire-and-forget achievement checks for Shot cashout
    (async () => {
      const [{ value: totalGames }] = await db.select({ value: count() }).from(gamesTable).where(eq(gamesTable.playerId, playerId));
      const awarded: string[] = [];
      awarded.push(...await checkAndAward(playerId, { event: "bet_placed", totalGames: Number(totalGames) }));
      awarded.push(...await checkAndAward(playerId, { event: "game_result", gameType: "shot", outcome: "cashout", winAmount, multiplier: cashoutMult }));
      if (awarded.length > 0) {
        this.broadcast("achievement_unlocked", { playerId, username: bet.username, keys: awarded, at: Date.now() });
        if (bet.telegramId) {
          for (const key of awarded) {
            const def = ACHIEVEMENT_MAP[key];
            if (def) sendAchievementUnlocked(bet.telegramId, def.title, def.rarity);
          }
        }
      }
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
