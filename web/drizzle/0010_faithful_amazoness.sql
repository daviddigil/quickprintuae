CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"tokens_in" integer,
	"tokens_out" integer,
	"billable" boolean DEFAULT true NOT NULL,
	"ref" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"price_aed" numeric(10, 4) DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_rates_kind_unique" UNIQUE("kind")
);
--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "billing_model" text DEFAULT 'subscription' NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "included_usage" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "saas_invoices" ADD COLUMN "usage_amount" numeric(12, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "saas_invoices" ADD COLUMN "usage_detail" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "pending_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "pending_plan_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_events_tenant_idx" ON "usage_events" USING btree ("tenant_id","kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_events_ref_idx" ON "usage_events" USING btree ("tenant_id","kind","ref") WHERE "usage_events"."ref" is not null;
--> statement-breakpoint
-- subscription plans no longer take commission: that is what the new 'commission' plans are for
UPDATE "plans" SET "order_fee_pct" = 0 WHERE "code" IN ('starter', 'growth', 'enterprise');
