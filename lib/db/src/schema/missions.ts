import { pgTable, text, serial, timestamp, integer, boolean, date, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * daily_missions — one row per player per UTC date.
 * missions JSONB: Array<{ key: string; title: string; target: number; progress: number; completed: boolean }>
 */
export const dailyMissionsTable = pgTable("daily_missions", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  date: date("date").notNull(),
  missions: jsonb("missions").$type<DailyMission[]>().notNull().default([]),
  allCompleted: boolean("all_completed").notNull().default(false),
  bonusClaimed: boolean("bonus_claimed").notNull().default(false),
  bonusStriker: integer("bonus_striker").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("daily_missions_player_date_uidx").on(table.playerId, table.date),
  index("daily_missions_player_id_idx").on(table.playerId),
]);

export interface DailyMission {
  key: string;
  title: string;
  description: string;
  target: number;
  progress: number;
  completed: boolean;
  gameType?: string;
}

export const MISSION_POOL: Omit<DailyMission, "progress" | "completed">[] = [
  { key: "play_any_3",       title: "Hat-Trick",         description: "Play 3 games",                target: 3  },
  { key: "play_penalty_1",   title: "Penalty King",       description: "Win a penalty",               target: 1,  gameType: "penalty"   },
  { key: "play_minefield_1", title: "Mine Sweeper",       description: "Cash out a Minefield game",   target: 1,  gameType: "minefield" },
  { key: "play_freekick_1",  title: "Set Piece",          description: "Win a Free Kick",             target: 1,  gameType: "freekick"  },
  { key: "shot_2x",          title: "The Wall",           description: "Reach 2x in The Shot",        target: 1,  gameType: "shot"      },
  { key: "win_streak_2",     title: "Back-to-Back",       description: "Win 2 games in a row",        target: 2  },
  { key: "bet_500",          title: "High Roller",        description: "Place a 500+ STRIKER bet",    target: 1  },
];

export type DailyMissionsRow = typeof dailyMissionsTable.$inferSelect;
export const insertDailyMissionsSchema = createInsertSchema(dailyMissionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDailyMissions = z.infer<typeof insertDailyMissionsSchema>;
