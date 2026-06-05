import { pgTable, text, serial, timestamp, real, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const jackpotTable = pgTable("jackpot", {
  id: serial("id").primaryKey(),
  currentAmountTon: real("current_amount_ton").notNull().default(0),
  seedAmount: real("seed_amount").notNull().default(10),
  status: text("status").notNull().default("building"), // building | ready | triggered
  lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
  lastWinnerId: integer("last_winner_id"),
  lastWinnerUsername: text("last_winner_username"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertJackpotSchema = createInsertSchema(jackpotTable).omit({ id: true });
export type InsertJackpot = z.infer<typeof insertJackpotSchema>;
export type Jackpot = typeof jackpotTable.$inferSelect;
