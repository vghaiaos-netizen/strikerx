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
  { key: "trade_3_times",   title: "Active Trader",   description: "Place 3 trades",                    target: 3, gameType: "trading" },
  { key: "win_trade",       title: "In the Money",    description: "Win a trade",                       target: 1, gameType: "trading" },
  { key: "trade_btc",       title: "Bitcoin Signal",  description: "Place a BTC trade",                 target: 1, gameType: "trading" },
  { key: "trade_forex",     title: "FX Trader",       description: "Place a forex pair trade",          target: 1, gameType: "trading" },
  { key: "trade_commodity", title: "Commodities Desk",description: "Place a Gold or Oil trade",         target: 1, gameType: "trading" },
  { key: "win_streak_2",    title: "Back-to-Back",    description: "Win 2 trades in a row",             target: 2, gameType: "trading" },
  { key: "trade_60s",       title: "Quick Fire",      description: "Place a 60-second trade",           target: 1, gameType: "trading" },
  { key: "trade_5_times",   title: "High Volume",     description: "Place 5 trades in one day",         target: 5, gameType: "trading" },
  { key: "bet_500",         title: "High Roller",     description: "Place a 500+ STRIKER trade",        target: 1, gameType: "trading" },
  { key: "trade_eth",       title: "Ethereum Play",   description: "Place an ETH trade",                target: 1, gameType: "trading" },
];

export type DailyMissionsRow = typeof dailyMissionsTable.$inferSelect;
export const insertDailyMissionsSchema = createInsertSchema(dailyMissionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDailyMissions = z.infer<typeof insertDailyMissionsSchema>;
