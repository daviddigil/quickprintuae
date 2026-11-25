CREATE TABLE "order_commissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"basis" numeric(12, 2) NOT NULL,
	"jobs" integer DEFAULT 1 NOT NULL,
	"pct" numeric(6, 3) DEFAULT 0 NOT NULL,
	"per_job_fee" numeric(8, 2) DEFAULT 0 NOT NULL,
	"pct_fee" numeric(12, 2) DEFAULT 0 NOT NULL,
	"job_fee" numeric(12, 2) DEFAULT 0 NOT NULL,
	"fee" numeric(12, 2) DEFAULT 0 NOT NULL,
	"min_applied" boolean DEFAULT false NOT NULL,
	"max_applied" boolean DEFAULT false NOT NULL,
	"rule_source" text DEFAULT 'plan' NOT NULL,
	"plan_code" text,
	"status" text DEFAULT 'accrued' NOT NULL,
	"invoice_id" uuid,
	"credited_invoice_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_commissions_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "per_job_fee" numeric(8, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "min_order_fee" numeric(8, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "max_order_fee" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "commission_override" jsonb;--> statement-breakpoint
ALTER TABLE "order_commissions" ADD CONSTRAINT "order_commissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_commissions" ADD CONSTRAINT "order_commissions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_commissions" ADD CONSTRAINT "order_commissions_invoice_id_saas_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."saas_invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_commissions" ADD CONSTRAINT "order_commissions_credited_invoice_id_saas_invoices_id_fk" FOREIGN KEY ("credited_invoice_id") REFERENCES "public"."saas_invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_commissions_tenant_idx" ON "order_commissions" USING btree ("tenant_id","status","created_at");