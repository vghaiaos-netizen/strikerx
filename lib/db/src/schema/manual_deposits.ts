import { pgTable, text, serial, timestamp, real, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const manualDepositsTable = pgTable("manual_deposits", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  method: text("method").notNull().default("mpesa"), // mpesa | bank | other
  phoneNumber: text("phone_number"),
  amountKes: real("amount_kes"),
  reference: text("reference").notNull(),
  note: text("note"),
  status: text("status").notNull().default("pending"), // pending | confirmed | rejected
  amountStriker: real("amount_striker").default(0),
  confirmedBy: text("confirmed_by"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  rejectReason: text("reject_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("manual_deposits_player_id_idx").on(t.playerId),
  index("manual_deposits_status_idx").on(t.status),
]);

export const insertManualDepositSchema = createInsertSchema(manualDepositsTable).omit({ id: true, createdAt: true });
export type InsertManualDeposit = z.infer<typeof insertManualDepositSchema>;
export type ManualDeposit = typeof manualDepositsTable.$inferSelect;
