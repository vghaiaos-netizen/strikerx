import { pgTable, text, serial, timestamp, real, integer, boolean, index } from "drizzle-orm/pg-core";
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
  affiliateCode: text("affiliate_code"),
  isBanned: boolean("is_banned").notNull().default(false),
  isFlagged: boolean("is_flagged").notNull().default(false),
  banReason: text("ban_reason"),
  kycStatus: text("kyc_status").notNull().default("none"),
  groupMemberStatus: boolean("group_member_status").notNull().default(false),
  firstWithdrawalReviewed: boolean("first_withdrawal_reviewed").notNull().default(false),
  languagePreference: text("language_preference").notNull().default("en"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  // Leaderboard & referral lookups — frequently queried fields
  index("players_referred_by_idx").on(table.referredBy),
  index("players_affiliate_code_idx").on(table.affiliateCode),
  index("players_ton_wagered_idx").on(table.tonWageredLifetime),
  index("players_streak_idx").on(table.streakDays),
  index("players_last_active_idx").on(table.lastActive),
]);

export const insertPlayerSchema = createInsertSchema(playersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof playersTable.$inferSelect;
