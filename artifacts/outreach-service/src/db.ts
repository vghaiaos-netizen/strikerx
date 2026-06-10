import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  pgTable, serial, text, integer, boolean, timestamp, pgEnum,
} from "drizzle-orm/pg-core";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.warn("[outreach] DATABASE_URL not set — database features disabled. Set DATABASE_URL in Railway to enable scheduling.");
}

export const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
export const db = databaseUrl ? drizzle(pool!) : null;
export const dbAvailable = !!databaseUrl;

export const appConfigTable = pgTable("app_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const outreachGroupStatusEnum = pgEnum("outreach_group_status", [
  "discovered", "queued", "joining", "joined", "ready", "cooldown", "failed", "removed",
]);

export const outreachPostStatusEnum = pgEnum("outreach_post_status", [
  "sent", "failed", "flood_waited",
]);

export const outreachGroupsTable = pgTable("outreach_groups", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull().unique(),
  username: text("username"),
  title: text("title").notNull(),
  memberCount: integer("member_count").default(0),
  status: outreachGroupStatusEnum("status").notNull().default("discovered"),
  joinedAt: timestamp("joined_at"),
  coldPeriodEndsAt: timestamp("cold_period_ends_at"),
  lastPostedAt: timestamp("last_posted_at"),
  cooldownEndsAt: timestamp("cooldown_ends_at"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const outreachTemplatesTable = pgTable("outreach_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  body: text("body").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const outreachPostsTable = pgTable("outreach_posts", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(),
  templateId: integer("template_id"),
  renderedBody: text("rendered_body").notNull(),
  status: outreachPostStatusEnum("status").notNull().default("sent"),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
  error: text("error"),
});
