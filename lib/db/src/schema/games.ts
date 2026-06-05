import { pgTable, text, serial, timestamp, real, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const gamesTable = pgTable("games", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  gameType: text("game_type").notNull(), // shot | penalty | minefield | freekick
  betStriker: real("bet_striker").notNull(),
  resultMultiplier: real("result_multiplier").notNull().default(0),
  winAmount: real("win_amount").notNull().default(0),
  outcome: text("outcome").notNull(), // win | loss | cashout
  sessionId: text("session_id"),
  gameData: jsonb("game_data"), // game-specific state
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const crashRoundsTable = pgTable("crash_rounds", {
  id: serial("id").primaryKey(),
  status: text("status").notNull().default("waiting"), // waiting | running | crashed
  crashPoint: real("crash_point"),
  serverSeed: text("server_seed").notNull(),
  currentMultiplier: real("current_multiplier").notNull().default(1.0),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const minefieldSessionsTable = pgTable("minefield_sessions", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  betStriker: real("bet_striker").notNull(),
  gridSize: integer("grid_size").notNull(),
  mineCount: integer("mine_count").notNull(),
  minePositions: jsonb("mine_positions").notNull().$type<number[]>(),
  revealedPositions: jsonb("revealed_positions").notNull().$type<number[]>().default([]),
  currentMultiplier: real("current_multiplier").notNull().default(1.0),
  status: text("status").notNull().default("active"), // active | won | lost
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGameSchema = createInsertSchema(gamesTable).omit({ id: true, createdAt: true });
export type InsertGame = z.infer<typeof insertGameSchema>;
export type Game = typeof gamesTable.$inferSelect;
export type CrashRound = typeof crashRoundsTable.$inferSelect;
export type MinefieldSession = typeof minefieldSessionsTable.$inferSelect;
