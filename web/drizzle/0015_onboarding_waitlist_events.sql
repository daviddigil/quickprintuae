CREATE TABLE "gateway_setup_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"tenant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signup_waitlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"email_canonical" text NOT NULL,
	"shop_name" text,
	"phone" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "signup_waitlist_email_idx" ON "signup_waitlist" USING btree ("email_canonical");