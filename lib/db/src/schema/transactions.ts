import { pgTable, text, serial, timestamp, real, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  type: text("type").notNull(), // deposit | withdrawal | bet | win | bonus | cashback | referral
  amountStriker: real("amount_striker").notNull().default(0),
  amountTon: real("amount_ton"),
  currency: text("currency"),
  exchangeRateAtTime: real("exchange_rate_at_time"),
  status: text("status").notNull().default("pending"), // pending | completed | failed | cancelled
  externalId: text("external_id"), // CryptoBot invoice ID etc.
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("transactions_player_id_idx").on(t.playerId),
]);

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true, createdAt: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
