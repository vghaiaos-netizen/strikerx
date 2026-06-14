CREATE TABLE "demo_positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"asset_symbol" text NOT NULL,
	"direction" text NOT NULL,
	"contract_type" text DEFAULT 'UP_DOWN' NOT NULL,
	"stake" real NOT NULL,
	"entry_price" real NOT NULL,
	"exit_price" real,
	"lower_barrier" real,
	"upper_barrier" real,
	"payout_ratio" real NOT NULL,
	"win_amount" real DEFAULT 0 NOT NULL,
	"outcome" text DEFAULT 'pending' NOT NULL,
	"contract_duration_secs" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "ton_balance" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "usdt_balance" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "demo_usdt_balance" real DEFAULT 10000 NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "demo_reset_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "demo_last_reset" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trading_assets" ADD COLUMN "min_stake_ton" real DEFAULT 0.1 NOT NULL;--> statement-breakpoint
ALTER TABLE "trading_assets" ADD COLUMN "max_stake_ton" real DEFAULT 500 NOT NULL;--> statement-breakpoint
ALTER TABLE "trading_positions" ADD COLUMN "contract_type" text DEFAULT 'UP_DOWN' NOT NULL;--> statement-breakpoint
ALTER TABLE "trading_positions" ADD COLUMN "currency" text DEFAULT 'TON' NOT NULL;--> statement-breakpoint
ALTER TABLE "trading_positions" ADD COLUMN "lower_barrier" real;--> statement-breakpoint
ALTER TABLE "trading_positions" ADD COLUMN "upper_barrier" real;--> statement-breakpoint
CREATE INDEX "demo_positions_player_id_idx" ON "demo_positions" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "demo_positions_expires_at_idx" ON "demo_positions" USING btree ("expires_at");