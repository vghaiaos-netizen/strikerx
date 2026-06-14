import { pgTable, text, serial, timestamp, real, integer, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tradingAssetsTable = pgTable("trading_assets", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull().unique(),          // BTC | ETH | SOL | BNB | TON
  displayName: text("display_name").notNull(),
  binanceSymbol: text("binance_symbol").notNull(),    // BTCUSDT | ETHUSDT | etc.
  enabled: boolean("enabled").notNull().default(true),
  payoutRatio: real("payout_ratio").notNull().default(1.82),   // 1.82 = 82% profit on stake
  minStakeStriker: real("min_stake_striker").notNull().default(10),
  maxStakeStriker: real("max_stake_striker").notNull().default(10000),
  minStakeTon: real("min_stake_ton").notNull().default(0.1),
  maxStakeTon: real("max_stake_ton").notNull().default(500),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tradingPositionsTable = pgTable("trading_positions", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  assetSymbol: text("asset_symbol").notNull(),        // BTC | ETH | etc.
  direction: text("direction").notNull(),             // UP | DOWN | EVEN | ODD | OVER | UNDER | IN | OUT
  contractType: text("contract_type").notNull().default("UP_DOWN"), // UP_DOWN | EVEN_ODD | OVER_UNDER | IN_OUT
  currency: text("currency").notNull().default("TON"), // TON | USDT | STRIKER
  stakeStriker: real("stake_striker").notNull(),      // stake amount in the currency above (field name kept for DB compat)
  entryPrice: real("entry_price").notNull(),
  exitPrice: real("exit_price"),
  lowerBarrier: real("lower_barrier"),               // for IN_OUT: lower price bound
  upperBarrier: real("upper_barrier"),               // for IN_OUT: upper price bound
  payoutRatio: real("payout_ratio").notNull(),        // snapshot at trade open time
  winAmount: real("win_amount").notNull().default(0),
  outcome: text("outcome").notNull().default("pending"), // pending | win | loss | cancelled
  contractDurationSecs: integer("contract_duration_secs").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("trading_positions_player_id_idx").on(t.playerId),
  index("trading_positions_outcome_idx").on(t.outcome),
  index("trading_positions_expires_at_idx").on(t.expiresAt),
]);

export const insertTradingPositionSchema = createInsertSchema(tradingPositionsTable).omit({ id: true, createdAt: true });
export type InsertTradingPosition = z.infer<typeof insertTradingPositionSchema>;
export type TradingPosition = typeof tradingPositionsTable.$inferSelect;
export type TradingAsset = typeof tradingAssetsTable.$inferSelect;
