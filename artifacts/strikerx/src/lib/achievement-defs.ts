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

export const ACHIEVEMENT_MAP: Record<string, AchievementDef> = Object.fromEntries(
  ACHIEVEMENT_DEFS.map((a) => [a.key, a]),
);
