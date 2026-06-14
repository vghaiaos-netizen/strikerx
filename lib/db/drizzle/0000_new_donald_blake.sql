CREATE TYPE "public"."outreach_group_status" AS ENUM('discovered', 'queued', 'joining', 'joined', 'ready', 'cooldown', 'failed', 'removed');--> statement-breakpoint
CREATE TYPE "public"."outreach_post_status" AS ENUM('sent', 'failed', 'flood_waited');--> statement-breakpoint
CREATE TABLE "players" (
	"id" serial PRIMARY KEY NOT NULL,
	"telegram_id" text NOT NULL,
	"username" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"striker_balance" real DEFAULT 0 NOT NULL,
	"boot_balance" real DEFAULT 0 NOT NULL,
	"captain_balance" real DEFAULT 0 NOT NULL,
	"ton_wagered_lifetime" real DEFAULT 0 NOT NULL,
	"striker_wagered_since_bonus" real DEFAULT 0 NOT NULL,
	"vip_tier" text DEFAULT 'sunday_league' NOT NULL,
	"streak_days" integer DEFAULT 0 NOT NULL,
	"last_streak_claim" timestamp with time zone,
	"last_active" timestamp with time zone DEFAULT now(),
	"device_fingerprint" text,
	"referral_code" text NOT NULL,
	"referred_by" text,
	"affiliate_code" text,
	"is_banned" boolean DEFAULT false NOT NULL,
	"is_flagged" boolean DEFAULT false NOT NULL,
	"ban_reason" text,
	"kyc_status" text DEFAULT 'none' NOT NULL,
	"group_member_status" boolean DEFAULT false NOT NULL,
	"first_withdrawal_reviewed" boolean DEFAULT false NOT NULL,
	"country" text,
	"language_preference" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_telegram_id_unique" UNIQUE("telegram_id"),
	CONSTRAINT "players_referral_code_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"type" text NOT NULL,
	"amount_striker" real DEFAULT 0 NOT NULL,
	"amount_ton" real,
	"currency" text,
	"exchange_rate_at_time" real,
	"status" text DEFAULT 'pending' NOT NULL,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crash_rounds" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"crash_point" real,
	"server_seed" text NOT NULL,
	"current_multiplier" real DEFAULT 1 NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"game_type" text NOT NULL,
	"bet_striker" real NOT NULL,
	"result_multiplier" real DEFAULT 0 NOT NULL,
	"win_amount" real DEFAULT 0 NOT NULL,
	"outcome" text NOT NULL,
	"session_id" text,
	"game_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "minefield_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"bet_striker" real NOT NULL,
	"grid_size" integer NOT NULL,
	"mine_count" integer NOT NULL,
	"mine_positions" jsonb NOT NULL,
	"revealed_positions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_multiplier" real DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jackpot" (
	"id" serial PRIMARY KEY NOT NULL,
	"current_amount_ton" real DEFAULT 0 NOT NULL,
	"seed_amount" real DEFAULT 10 NOT NULL,
	"status" text DEFAULT 'building' NOT NULL,
	"last_triggered_at" timestamp with time zone,
	"last_winner_id" integer,
	"last_winner_username" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"best_multiplier" real DEFAULT 0 NOT NULL,
	"total_wagered" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"prize_pool_ton" real DEFAULT 0 NOT NULL,
	"entry_fee_boots" real,
	"status" text DEFAULT 'upcoming' NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"rake_captured" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_action" text NOT NULL,
	"target_player_id" integer,
	"old_value" text,
	"new_value" text,
	"reason" text,
	"performed_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" serial PRIMARY KEY NOT NULL,
	"referrer_id" integer NOT NULL,
	"referred_id" integer NOT NULL,
	"tier" integer DEFAULT 1 NOT NULL,
	"earnings_paid_striker" real DEFAULT 0 NOT NULL,
	"is_active" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vip_cashback" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"period" text NOT NULL,
	"losses_ton" real DEFAULT 0 NOT NULL,
	"cashback_striker" real DEFAULT 0 NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "withdrawals" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"amount_striker" real NOT NULL,
	"amount_ton" real NOT NULL,
	"destination_address" text NOT NULL,
	"currency" text DEFAULT 'TON' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reject_reason" text,
	"external_transfer_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"is_secret" boolean DEFAULT false NOT NULL,
	"is_restart_required" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_config_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "player_achievements" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"achievement_key" text NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "affiliates" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"owner_id" integer,
	"commission_rate" real DEFAULT 0.1 NOT NULL,
	"total_earned" real DEFAULT 0 NOT NULL,
	"total_referred" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliates_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "kyc_verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"full_name" text,
	"country" text,
	"doc_type" text,
	"telegram_photo_file_id" text,
	"review_note" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"telegram_id" text NOT NULL,
	"username" text,
	"title" text NOT NULL,
	"member_count" integer DEFAULT 0,
	"status" "outreach_group_status" DEFAULT 'discovered' NOT NULL,
	"joined_at" timestamp,
	"cold_period_ends_at" timestamp,
	"last_posted_at" timestamp,
	"cooldown_ends_at" timestamp,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "outreach_groups_telegram_id_unique" UNIQUE("telegram_id")
);
--> statement-breakpoint
CREATE TABLE "outreach_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"template_id" integer,
	"rendered_body" text NOT NULL,
	"status" "outreach_post_status" DEFAULT 'sent' NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "outreach_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"body" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_missions" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"date" date NOT NULL,
	"missions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"all_completed" boolean DEFAULT false NOT NULL,
	"bonus_claimed" boolean DEFAULT false NOT NULL,
	"bonus_striker" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trading_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"display_name" text NOT NULL,
	"binance_symbol" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"payout_ratio" real DEFAULT 1.82 NOT NULL,
	"min_stake_striker" real DEFAULT 10 NOT NULL,
	"max_stake_striker" real DEFAULT 10000 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trading_assets_symbol_unique" UNIQUE("symbol")
);
--> statement-breakpoint
CREATE TABLE "trading_positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"asset_symbol" text NOT NULL,
	"direction" text NOT NULL,
	"stake_striker" real NOT NULL,
	"entry_price" real NOT NULL,
	"exit_price" real,
	"payout_ratio" real NOT NULL,
	"win_amount" real DEFAULT 0 NOT NULL,
	"outcome" text DEFAULT 'pending' NOT NULL,
	"contract_duration_secs" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outreach_posts" ADD CONSTRAINT "outreach_posts_group_id_outreach_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."outreach_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_posts" ADD CONSTRAINT "outreach_posts_template_id_outreach_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."outreach_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "players_referred_by_idx" ON "players" USING btree ("referred_by");--> statement-breakpoint
CREATE INDEX "players_affiliate_code_idx" ON "players" USING btree ("affiliate_code");--> statement-breakpoint
CREATE INDEX "players_ton_wagered_idx" ON "players" USING btree ("ton_wagered_lifetime");--> statement-breakpoint
CREATE INDEX "players_streak_idx" ON "players" USING btree ("streak_days");--> statement-breakpoint
CREATE INDEX "players_last_active_idx" ON "players" USING btree ("last_active");--> statement-breakpoint
CREATE INDEX "transactions_player_id_idx" ON "transactions" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "games_player_id_idx" ON "games" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "minefield_sessions_player_id_idx" ON "minefield_sessions" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_achievements_player_key_uidx" ON "player_achievements" USING btree ("player_id","achievement_key");--> statement-breakpoint
CREATE INDEX "player_achievements_player_id_idx" ON "player_achievements" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_missions_player_date_uidx" ON "daily_missions" USING btree ("player_id","date");--> statement-breakpoint
CREATE INDEX "daily_missions_player_id_idx" ON "daily_missions" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "trading_positions_player_id_idx" ON "trading_positions" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "trading_positions_outcome_idx" ON "trading_positions" USING btree ("outcome");--> statement-breakpoint
CREATE INDEX "trading_positions_expires_at_idx" ON "trading_positions" USING btree ("expires_at");