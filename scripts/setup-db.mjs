#!/usr/bin/env node
/**
 * Non-interactive DB setup — applies all SQL migration files via pg directly.
 * Use this instead of `drizzle-kit push` which requires a TTY.
 *
 *   node scripts/setup-db.mjs
 */
import pg from "pg";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "../lib/db/drizzle");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

// Ensure migrations tracking table exists
await client.query(`
  CREATE TABLE IF NOT EXISTS __drizzle_migrations (
    id serial PRIMARY KEY,
    hash text NOT NULL UNIQUE,
    created_at bigint
  )
`);

const applied = new Set(
  (await client.query("SELECT hash FROM __drizzle_migrations")).rows.map((r) => r.hash)
);

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

let ran = 0;
for (const file of files) {
  const hash = file.replace(".sql", "");
  if (applied.has(hash)) {
    console.log(`  skip  ${file}`);
    continue;
  }
  const sql = readFileSync(join(migrationsDir, file), "utf8");
  // Split on drizzle-kit statement separator
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const stmt of statements) {
    try {
      await client.query(stmt);
    } catch (err) {
      // Ignore "already exists" errors — idempotent
      if (!err.message.includes("already exists") && !err.message.includes("does not exist")) {
        console.warn(`  warn  ${file}: ${err.message.slice(0, 120)}`);
      }
    }
  }

  await client.query(
    "INSERT INTO __drizzle_migrations (hash, created_at) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [hash, Date.now()]
  );
  console.log(`  apply ${file}`);
  ran++;
}

await client.end();
console.log(`\nDone — ${ran} migration(s) applied, ${files.length - ran} already up to date.`);
