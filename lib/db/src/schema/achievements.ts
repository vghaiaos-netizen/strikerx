import { pgTable, text, serial, timestamp, integer, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const playerAchievementsTable = pgTable("player_achievements", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  achievementKey: text("achievement_key").notNull(),
  unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
}, (table) => [
  // Unique constraint prevents double-awarding the same achievement to a player
  uniqueIndex("player_achievements_player_key_uidx").on(table.playerId, table.achievementKey),
  // Index for fast per-player lookups (called after every game result)
  index("player_achievements_player_id_idx").on(table.playerId),
]);

export type PlayerAchievement = typeof playerAchievementsTable.$inferSelect;
export const insertPlayerAchievementSchema = createInsertSchema(playerAchievementsTable).omit({ id: true, unlockedAt: true });
export type InsertPlayerAchievement = z.infer<typeof insertPlayerAchievementSchema>;
