import { db, playerAchievementsTable, playersTable, gamesTable, transactionsTable } from "@workspace/db";
import { eq, and, count, sql } from "drizzle-orm";
import { logger } from "./logger";
import { sendAchievementUnlocked } from "../services/telegramNotify";

export type AchievementRarity = "common" | "rare" | "epic" | "legendary";

export interface AchievementDef {
  key: string;
  title: string;
  description: string;
  rarity: AchievementRarity;
}

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  { key: "first_bet",        title: "First Kick",       description: "Place your very first bet",               rarity: "common"    },
  { key: "first_win",        title: "First Goal",        description: "Win your very first game",                rarity: "common"    },
  { key: "crash_5x",         title: "Escape Artist",     description: "Cash out at 5x or higher in The Shot",    rarity: "common"    },
  { key: "crash_25x",        title: "Daredevil",         description: "Cash out at 25x or higher in The Shot",   rarity: "rare"      },
  { key: "crash_100x",       title: "Immortal",          description: "Cash out at 100x or higher in The Shot",  rarity: "legendary" },
  { key: "minefield_5",      title: "Minesweeper",       description: "Survive 5+ safe picks in Minefield",      rarity: "rare"      },
  { key: "big_winner",       title: "Big Winner",        description: "Win 500+ STRIKER in a single game",       rarity: "rare"      },
  { key: "jackpot_winner",   title: "Golden Boot",       description: "Win the Golden Boot jackpot",             rarity: "legendary" },
  { key: "centurion",        title: "Centurion",         description: "Play 100 games total",                    rarity: "epic"      },
  { key: "high_roller",      title: "High Roller",       description: "Wager 1+ TON lifetime",                   rarity: "epic"      },
  { key: "vip_champions",    title: "Champions League",  description: "Reach Champions League VIP tier",         rarity: "rare"      },
  { key: "vip_world_cup",    title: "World Cup",         description: "Reach World Cup VIP tier",                rarity: "epic"      },
  { key: "lucky_7",          title: "Lucky Seven",       description: "Build a 7-day login streak",              rarity: "rare"      },
  { key: "streak_legend",    title: "Streak Legend",     description: "Maintain a 30-day login streak",          rarity: "epic"      },
  { key: "referral_pioneer", title: "Pioneer",           description: "Get your first successful referral",      rarity: "common"    },
  { key: "referral_squad",   title: "Squad Leader",      description: "Refer 5 or more players",                 rarity: "rare"      },
];

export const ACHIEVEMENT_MAP = Object.fromEntries(ACHIEVEMENT_DEFS.map(a => [a.key, a]));

// Final-tier achievements in their respective chains → award 1 CAPTAIN token on unlock
const CAPTAIN_AWARD_KEYS = new Set([
  "crash_100x",       // final of: crash_5x → crash_25x → crash_100x
  "vip_world_cup",    // final of: vip_champions → vip_world_cup
  "referral_squad",   // final of: referral_pioneer → referral_squad
  "streak_legend",    // final of: lucky_7 → streak_legend
  "jackpot_winner",   // standalone legendary
]);

async function hasAchievement(playerId: number, key: string): Promise<boolean> {
  const [row] = await db
    .select()
    .from(playerAchievementsTable)
    .where(and(eq(playerAchievementsTable.playerId, playerId), eq(playerAchievementsTable.achievementKey, key)));
  return !!row;
}

async function awardAchievement(playerId: number, key: string, metadata?: Record<string, unknown>): Promise<boolean> {
  if (await hasAchievement(playerId, key)) return false;
  try {
    await db.insert(playerAchievementsTable).values({ playerId, achievementKey: key, metadata: metadata ?? null });
    logger.info({ playerId, key }, "Achievement unlocked");
    return true;
  } catch {
    return false;
  }
}

export interface AchievementContext {
  event: "bet_placed" | "game_result" | "jackpot_won" | "vip_updated" | "streak_claimed" | "referral_joined";
  gameType?: string;
  outcome?: string;
  winAmount?: number;
  multiplier?: number;
  safePickCount?: number;
  streakDays?: number;
  vipTier?: string;
  totalGames?: number;
  tonWageredLifetime?: number;
  referralCount?: number;
}

export async function checkAndAward(playerId: number, ctx: AchievementContext): Promise<string[]> {
  const awarded: string[] = [];

  const award = async (key: string, meta?: Record<string, unknown>) => {
    if (await awardAchievement(playerId, key, meta)) awarded.push(key);
  };

  if (ctx.event === "bet_placed") {
    await award("first_bet");
    if (ctx.totalGames !== undefined && ctx.totalGames >= 100) await award("centurion");
    if (ctx.tonWageredLifetime !== undefined && ctx.tonWageredLifetime >= 1) await award("high_roller");
  }

  if (ctx.event === "game_result") {
    if (ctx.outcome !== "loss") await award("first_win");
    if (ctx.winAmount !== undefined && ctx.winAmount >= 500) await award("big_winner", { winAmount: ctx.winAmount, gameType: ctx.gameType });
    if (ctx.gameType === "shot" && ctx.multiplier !== undefined) {
      if (ctx.multiplier >= 5)   await award("crash_5x",   { multiplier: ctx.multiplier });
      if (ctx.multiplier >= 25)  await award("crash_25x",  { multiplier: ctx.multiplier });
      if (ctx.multiplier >= 100) await award("crash_100x", { multiplier: ctx.multiplier });
    }
    if (ctx.gameType === "minefield" && ctx.safePickCount !== undefined && ctx.safePickCount >= 5) {
      await award("minefield_5", { picks: ctx.safePickCount });
    }
  }

  if (ctx.event === "jackpot_won") await award("jackpot_winner");

  if (ctx.event === "vip_updated") {
    if (ctx.vipTier === "champions_league" || ctx.vipTier === "world_cup") await award("vip_champions");
    if (ctx.vipTier === "world_cup") await award("vip_world_cup");
  }

  if (ctx.event === "streak_claimed") {
    if (ctx.streakDays !== undefined && ctx.streakDays >= 7)  await award("lucky_7",        { days: ctx.streakDays });
    if (ctx.streakDays !== undefined && ctx.streakDays >= 30) await award("streak_legend",  { days: ctx.streakDays });
  }

  if (ctx.event === "referral_joined") {
    if (ctx.referralCount !== undefined && ctx.referralCount >= 1) await award("referral_pioneer");
    if (ctx.referralCount !== undefined && ctx.referralCount >= 5) await award("referral_squad");
  }

  // Award 1 CAPTAIN token for each final-tier achievement unlocked (fire-and-forget)
  const captainEarned = awarded.filter(k => CAPTAIN_AWARD_KEYS.has(k));
  if (captainEarned.length > 0) {
    (async () => {
      await db.update(playersTable)
        .set({ captainBalance: sql`${playersTable.captainBalance} + ${captainEarned.length}` })
        .where(eq(playersTable.id, playerId));
      for (const _k of captainEarned) {
        await db.insert(transactionsTable).values({ playerId, type: "captain_award", captainAmount: 1, status: "completed" });
      }
    })().catch((err) => logger.warn({ err }, "Achievement captain award failed"));
  }

  // Send Telegram notifications for newly unlocked achievements (fire-and-forget)
  if (awarded.length > 0) {
    (async () => {
      const [player] = await db
        .select({ telegramId: playersTable.telegramId })
        .from(playersTable)
        .where(eq(playersTable.id, playerId));
      if (player?.telegramId) {
        for (const key of awarded) {
          const def = ACHIEVEMENT_MAP[key];
          if (def) sendAchievementUnlocked(player.telegramId, def.title, 0);
        }
      }
    })().catch((err) => logger.warn({ err }, "Achievement notification failed"));
  }

  return awarded;
}

export async function getPlayerAchievements(playerId: number) {
  const unlocked = await db
    .select()
    .from(playerAchievementsTable)
    .where(eq(playerAchievementsTable.playerId, playerId));

  return ACHIEVEMENT_DEFS.map(def => {
    const row = unlocked.find(u => u.achievementKey === def.key);
    return {
      key: def.key,
      title: def.title,
      description: def.description,
      rarity: def.rarity,
      unlockedAt: row?.unlockedAt?.toISOString() ?? null,
      metadata: row?.metadata ?? null,
    };
  });
}
