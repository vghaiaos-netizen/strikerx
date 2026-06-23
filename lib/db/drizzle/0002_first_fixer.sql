CREATE TABLE "manual_deposits" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"method" text DEFAULT 'mpesa' NOT NULL,
	"phone_number" text,
	"amount_kes" real,
	"reference" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"amount_striker" real DEFAULT 0,
	"confirmed_by" text,
	"confirmed_at" timestamp with time zone,
	"reject_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "manual_deposits_player_id_idx" ON "manual_deposits" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "manual_deposits_status_idx" ON "manual_deposits" USING btree ("status");