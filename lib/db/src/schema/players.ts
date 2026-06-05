import { pgTable, text, serial, timestamp, real, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const playersTable = pgTable("players", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull().unique(),
  username: text("username").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  strikerBalance: real("striker_balance").notNull().default(0),
  bootBalance: real("boot_balance").notNull().default(0),
  captainBalance: real("captain_balance").notNull().default(0),
  tonWageredLifetime: real("ton_wagered_lifetime").notNull().default(0),
  strikerWageredSinceBonus: real("striker_wagered_since_bonus").notNull().default(0),
  vipTier: text("vip_tier").notNull().default("sunday_league"),
  streakDays: integer("streak_days").notNull().default(0),
  lastStreakClaim: timestamp("last_streak_claim", { withTimezone: true }),
  lastActive: timestamp("last_active", { withTimezone: true }).defaultNow(),
  deviceFingerprint: text("device_fingerprint"),
  referralCode: text("referral_code").notNull().unique(),
  referredBy: text("referred_by"),
  isBanned: boolean("is_banned").notNull().default(false),
  isFlagged: boolean("is_flagged").notNull().default(false),
  banReason: text("ban_reason"),
  groupMemberStatus: boolean("group_member_status").notNull().default(false),
  firstWithdrawalReviewed: boolean("first_withdrawal_reviewed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPlayerSchema = createInsertSchema(playersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof playersTable.$inferSelect;
