import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";

export const appConfigTable = pgTable("app_config", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull().default(""),
  category: text("category").notNull().default("general"),
  label: text("label").notNull(),
  description: text("description"),
  isSecret: boolean("is_secret").notNull().default(false),
  isRestartRequired: boolean("is_restart_required").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AppConfig = typeof appConfigTable.$inferSelect;
