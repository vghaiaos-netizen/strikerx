import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const playerAchievementsTable = pgTable("player_achievements", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  achievementKey: text("achievement_key").notNull(),
  unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
});

export type PlayerAchievement = typeof playerAchievementsTable.$inferSelect;
export const insertPlayerAchievementSchema = createInsertSchema(playerAchievementsTable).omit({ id: true, unlockedAt: true });
export type InsertPlayerAchievement = z.infer<typeof insertPlayerAchievementSchema>;
