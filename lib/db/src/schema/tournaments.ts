import { pgTable, text, serial, timestamp, real, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tournamentsTable = pgTable("tournaments", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // daily | weekly | flash | world_cup
  prizePoolTon: real("prize_pool_ton").notNull().default(0),
  entryFeeBoots: real("entry_fee_boots"),
  status: text("status").notNull().default("upcoming"), // upcoming | active | ended
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }).notNull(),
  rakeCapured: real("rake_captured").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tournamentEntriesTable = pgTable("tournament_entries", {
  id: serial("id").primaryKey(),
  tournamentId: integer("tournament_id").notNull(),
  playerId: integer("player_id").notNull(),
  bestMultiplier: real("best_multiplier").notNull().default(0),
  totalWagered: real("total_wagered").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Tournament = typeof tournamentsTable.$inferSelect;
export type TournamentEntry = typeof tournamentEntriesTable.$inferSelect;
export const insertTournamentSchema = createInsertSchema(tournamentsTable).omit({ id: true, createdAt: true });
export type InsertTournament = z.infer<typeof insertTournamentSchema>;
