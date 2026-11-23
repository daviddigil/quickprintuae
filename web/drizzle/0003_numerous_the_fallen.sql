CREATE TYPE "public"."print_job_status" AS ENUM('awaiting_payment', 'queued', 'printing', 'printed', 'failed', 'cancelled', 'needs_manual');--> statement-breakpoint
CREATE TABLE "print_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"api_key_hash" text NOT NULL,
	"api_key_prefix" text NOT NULL,
	"last_seen_at" timestamp with time zone,
	"printers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "print_agents_api_key_hash_unique" UNIQUE("api_key_hash")
);
--> statement-breakpoint
CREATE TABLE "print_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid,
	"file_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"ticket_no" text NOT NULL,
	"status" "print_job_status" DEFAULT 'awaiting_payment' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"copies" integer DEFAULT 1 NOT NULL,
	"pages" integer DEFAULT 1 NOT NULL,
	"pages_verified" boolean DEFAULT true NOT NULL,
	"options" jsonb NOT NULL,
	"printer_name" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claimed_by_agent_id" uuid,
	"claimed_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"queued_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "walk_in_customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"name" text NOT NULL,
	"visits" integer DEFAULT 0 NOT NULL,
	"total_spent" numeric(12, 2) DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "source" text DEFAULT 'online' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "walk_in_customer_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ticket_no" text;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "flags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "print_agents" ADD CONSTRAINT "print_agents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_claimed_by_agent_id_print_agents_id_fk" FOREIGN KEY ("claimed_by_agent_id") REFERENCES "public"."print_agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walk_in_customers" ADD CONSTRAINT "walk_in_customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "print_jobs_queue_idx" ON "print_jobs" USING btree ("tenant_id","status","priority","queued_at");--> statement-breakpoint
CREATE INDEX "print_jobs_order_idx" ON "print_jobs" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "walk_in_customers_tenant_phone_idx" ON "walk_in_customers" USING btree ("tenant_id","phone");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_walk_in_customer_id_walk_in_customers_id_fk" FOREIGN KEY ("walk_in_customer_id") REFERENCES "public"."walk_in_customers"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
UPDATE "plans" SET "flags" = '["walk_in_queue"]'::jsonb WHERE "code" IN ('growth', 'enterprise');
