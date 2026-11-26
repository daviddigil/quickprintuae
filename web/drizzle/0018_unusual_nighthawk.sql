CREATE TABLE "offer_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_code" text,
	"terms" jsonb NOT NULL,
	"months_remaining" integer,
	"total_discount" numeric(12, 2) DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"headline" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"theme" text DEFAULT 'custom' NOT NULL,
	"kind" text NOT NULL,
	"value" numeric(10, 2) DEFAULT 0 NOT NULL,
	"duration_months" integer,
	"plan_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cycles" jsonb DEFAULT '["monthly","yearly"]'::jsonb NOT NULL,
	"audience" text DEFAULT 'new' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"max_redemptions" integer,
	"redeemed_count" integer DEFAULT 0 NOT NULL,
	"show_banner" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saas_invoices" ADD COLUMN "discount_amount" numeric(12, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "saas_invoices" ADD COLUMN "discount_detail" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "offer_redemptions" ADD CONSTRAINT "offer_redemptions_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_redemptions" ADD CONSTRAINT "offer_redemptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "offer_redemptions_once_idx" ON "offer_redemptions" USING btree ("offer_id","tenant_id");--> statement-breakpoint
CREATE INDEX "offer_redemptions_tenant_idx" ON "offer_redemptions" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "offers_code_idx" ON "offers" USING btree (upper("code")) WHERE "offers"."code" is not null;--> statement-breakpoint
CREATE INDEX "offers_status_idx" ON "offers" USING btree ("status","starts_at","ends_at");