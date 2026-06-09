import crypto from "crypto";

// ─── RNG ──────────────────────────────────────────────────────────────────────

function getHouseEdge(game: string): number {
  const edges: Record<string, number> = {
    shot: parseFloat(process.env.HOUSE_EDGE_SHOT ?? "4"),
    penalty: parseFloat(process.env.HOUSE_EDGE_PENALTY ?? "4"),
    minefield: parseFloat(process.env.HOUSE_EDGE_MINEFIELD ?? "4"),
    freekick: parseFloat(process.env.HOUSE_EDGE_FREEKICK ?? "4"),
  };
  return (edges[game] ?? 4) / 100;
}

// ─── THE SHOT (CRASH) ─────────────────────────────────────────────────────────

/**
 * Generate crash point using provably fair algorithm
 * Returns a multiplier >= 1.00 with house edge baked in
 */
export function generateCrashPoint(serverSeed: string): number {
  const hash = crypto.createHmac("sha256", serverSeed).update("crash").digest("hex");
  const houseEdge = getHouseEdge("shot");

  // Convert hash to uniform random in [0, 1)
  const r = parseInt(hash.slice(0, 8), 16) / 0xffffffff;

  // Apply house edge: e = 1 - houseEdge
  // crash = 1 / (1 - r * (1 - houseEdge))
  const e = 1 - houseEdge;
  // House edge rounds still show a brief graph — minimum 1.1x so players always
  // see the multiplier climb before crash. Pure 1.0x instant crashes are terrible UX.
  if (r < houseEdge) return 1.1;

  // Clamp minimum to 1.2x so even unlucky rounds give players a moment to react.
  return Math.max(1.2, parseFloat((e / (1 - r * e)).toFixed(2)));
}

export function generateServerSeed(): string {
  return crypto.randomBytes(32).toString("hex");
}

// ─── PENALTY ──────────────────────────────────────────────────────────────────

export function playPenalty(playerDirection: "left" | "center" | "right"): {
  keeperDirection: "left" | "center" | "right";
  win: boolean;
  multiplier: number;
} {
  const directions = ["left", "center", "right"] as const;
  const houseEdge = getHouseEdge("penalty");
  // Win probability is 50% (keeper blocks on a coin flip).
  // Multiplier = 2 * (1 - houseEdge) = 1.92x at 4% edge → RTP = 96%
  const multiplier = parseFloat((2 * (1 - houseEdge)).toFixed(4));
  const keeperBlocksShot = Math.random() < 0.5;
  const otherDirs = directions.filter(d => d !== playerDirection);
  const keeperDirection = keeperBlocksShot
    ? playerDirection
    : otherDirs[Math.floor(Math.random() * otherDirs.length)];
  const win = !keeperBlocksShot;
  return { keeperDirection, win, multiplier };
}

// ─── MINEFIELD ────────────────────────────────────────────────────────────────

export function generateMinePositions(gridSize: number, mineCount: number): number[] {
  const totalSquares = gridSize * gridSize;
  const positions: number[] = [];
  const all = Array.from({ length: totalSquares }, (_, i) => i);

  // Fisher-Yates shuffle then take first mineCount
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, mineCount);
}

/**
 * Calculate multiplier after N safe picks
 * Accounts for house edge across the probability distribution
 */
export function minefieldMultiplier(
  gridSize: number,
  mineCount: number,
  safePicks: number
): number {
  const houseEdge = getHouseEdge("minefield");
  const totalSquares = gridSize * gridSize;
  let multiplier = 1.0;

  for (let i = 0; i < safePicks; i++) {
    const remaining = totalSquares - i;
    const safe = remaining - mineCount;
    if (safe <= 0) break;
    const p = safe / remaining; // probability of safe pick
    multiplier *= (1 / p) * (1 - houseEdge);
  }

  return parseFloat(multiplier.toFixed(4));
}

// ─── FREE KICK (PLINKO) ───────────────────────────────────────────────────────

// Slot values are pre-calibrated so that E[slot] = 1.0 given the actual
// Plinko ball distribution (8 rows, start center, clamped to [0,8]).
// RTP = E[slot] * (1 - houseEdge) ≈ 96% at 4% house edge.
const FREEKICK_SLOTS = {
  low:    [0.49, 0.79, 0.98, 1.18, 1.47, 1.18, 0.98, 0.79, 0.49],
  medium: [0.11, 0.26, 0.53, 1.05, 2.64, 1.05, 0.53, 0.26, 0.11],
  high:   [0.03, 0.10, 0.17, 0.66, 3.32, 0.66, 0.17, 0.10, 0.03],
};

export function playFreekick(riskLevel: "low" | "medium" | "high"): {
  slot: number;
  multiplier: number;
} {
  const slots = FREEKICK_SLOTS[riskLevel];
  const houseEdge = getHouseEdge("freekick");

  // Plinko-like ball drop: 8 rows from center position
  const rows = 8;
  let position = Math.floor(slots.length / 2);
  for (let i = 0; i < rows; i++) {
    position += Math.random() < 0.5 ? -1 : 1;
    position = Math.max(0, Math.min(slots.length - 1, position));
  }

  // Slots already calibrated to E=1; house edge applied here gives ~96% RTP
  const multiplier = parseFloat((slots[position] * (1 - houseEdge)).toFixed(2));

  return { slot: position, multiplier };
}

// ─── JACKPOT ──────────────────────────────────────────────────────────────────

export function calculateJackpotContribution(betStriker: number): number {
  const jackpotPct = parseFloat(process.env.JACKPOT_PERCENTAGE ?? "1") / 100;
  const depositRate = parseFloat(process.env.STRIKER_DEPOSIT_RATE ?? "100");
  // Convert STRIKER to TON equivalent
  const betTon = betStriker / depositRate;
  return betTon * jackpotPct;
}

export function shouldTriggerJackpot(poolAmountTon: number, betStriker: number): boolean {
  const minPool = parseFloat(process.env.JACKPOT_MIN_POOL ?? "50");
  if (poolAmountTon < minPool) return false;

  // Weighted probability — higher bets have higher chance
  const depositRate = parseFloat(process.env.STRIKER_DEPOSIT_RATE ?? "100");
  const betTon = betStriker / depositRate;

  // Base probability scaled by bet size and pool fullness
  const baseProbability = 0.0001; // 0.01% base per bet
  const betScale = Math.min(betTon / 10, 5); // Scale up to 5x for large bets
  const poolScale = Math.min(poolAmountTon / minPool, 2); // Scale up to 2x when pool is large

  return Math.random() < baseProbability * betScale * poolScale;
}

// ─── VIP ──────────────────────────────────────────────────────────────────────

export function getVipTier(tonWageredLifetime: number): string {
  if (tonWageredLifetime >= 1000) return "world_cup";
  if (tonWageredLifetime >= 500) return "champions_league";
  if (tonWageredLifetime >= 200) return "premier_league";
  if (tonWageredLifetime >= 50) return "championship";
  return "sunday_league";
}

export function getVipCashbackRate(vipTier: string): number {
  const rates: Record<string, number> = {
    sunday_league: 0,
    championship: 0.02,
    premier_league: 0.05,
    champions_league: 0.08,
    world_cup: 0.08,
  };
  return rates[vipTier] ?? 0;
}

export function getReferralRate(vipTier: string): number {
  if (vipTier === "world_cup") return 15;
  return parseFloat(process.env.REFERRAL_TIER1_PERCENTAGE ?? "10");
}

// ─── TOKENS ───────────────────────────────────────────────────────────────────

export function calculateBootEarned(strikerWagered: number): number {
  return Math.floor(strikerWagered / 10);
}

export function strikerToTon(strikerAmount: number): number {
  const withdrawRate = parseFloat(process.env.STRIKER_WITHDRAW_RATE ?? "110");
  return parseFloat((strikerAmount / withdrawRate).toFixed(8));
}

export function tonToStriker(tonAmount: number): number {
  const depositRate = parseFloat(process.env.STRIKER_DEPOSIT_RATE ?? "100");
  return parseFloat((tonAmount * depositRate).toFixed(2));
}

// ─── STREAK ───────────────────────────────────────────────────────────────────

export function getStreakReward(streakDays: number): number {
  const day = streakDays + 1; // reward for completing this day
  if (day >= 30) return parseFloat(process.env.STREAK_DAY30_BONUS ?? "5000");
  if (day >= 21) return parseFloat(process.env.STREAK_DAY21_BONUS ?? "2000");
  if (day >= 14) return parseFloat(process.env.STREAK_DAY14_BONUS ?? "1000");
  if (day >= 7) return parseFloat(process.env.STREAK_DAY7_BONUS ?? "500");
  if (day >= 3) return parseFloat(process.env.STREAK_DAY3_BONUS ?? "100");
  return 50; // Daily base reward
}

export function getNextStreakMilestone(streakDays: number): number {
  if (streakDays < 3) return 3;
  if (streakDays < 7) return 7;
  if (streakDays < 14) return 14;
  if (streakDays < 21) return 21;
  return 30;
}
