import { pgTable, text, serial, timestamp, real, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const referralsTable = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerId: integer("referrer_id").notNull(),
  referredId: integer("referred_id").notNull(),
  tier: integer("tier").notNull().default(1), // 1 or 2
  earningsPaidStriker: real("earnings_paid_striker").notNull().default(0),
  isActive: text("is_active").notNull().default("pending"), // pending | active | inactive
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const withdrawalsTable = pgTable("withdrawals", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  amountStriker: real("amount_striker").notNull(),
  amountTon: real("amount_ton").notNull(),
  destinationAddress: text("destination_address").notNull(),
  currency: text("currency").notNull().default("TON"),
  status: text("status").notNull().default("pending"), // pending | under_review | approved | processing | completed | rejected
  reviewedBy: text("reviewed_by"),
  rejectReason: text("reject_reason"),
  externalTransferId: text("external_transfer_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const auditLogTable = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  adminAction: text("admin_action").notNull(),
  targetPlayerId: integer("target_player_id"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  reason: text("reason"),
  performedBy: text("performed_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vipCashbackTable = pgTable("vip_cashback", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  period: text("period").notNull(), // YYYY-WW format
  lossesTon: real("losses_ton").notNull().default(0),
  cashbackStriker: real("cashback_striker").notNull().default(0),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Withdrawal = typeof withdrawalsTable.$inferSelect;
export type Referral = typeof referralsTable.$inferSelect;
export type AuditLog = typeof auditLogTable.$inferSelect;

export const insertWithdrawalSchema = createInsertSchema(withdrawalsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWithdrawal = z.infer<typeof insertWithdrawalSchema>;
