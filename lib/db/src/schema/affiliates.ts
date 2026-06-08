import { pgTable, text, serial, timestamp, real, integer, boolean } from "drizzle-orm/pg-core";

export const affiliatesTable = pgTable("affiliates", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  ownerId: integer("owner_id"),
  commissionRate: real("commission_rate").notNull().default(0.10),
  totalEarned: real("total_earned").notNull().default(0),
  totalReferred: integer("total_referred").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const kycVerificationsTable = pgTable("kyc_verifications", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  status: text("status").notNull().default("pending"),
  fullName: text("full_name"),
  country: text("country"),
  docType: text("doc_type"),
  telegramPhotoFileId: text("telegram_photo_file_id"),
  reviewNote: text("review_note"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Affiliate = typeof affiliatesTable.$inferSelect;
export type KycVerification = typeof kycVerificationsTable.$inferSelect;
