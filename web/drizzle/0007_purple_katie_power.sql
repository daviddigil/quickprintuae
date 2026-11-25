CREATE TABLE "order_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"gateway" text DEFAULT 'mamo' NOT NULL,
	"gateway_payment_id" text,
	"recipient_id" text,
	"gross" numeric(12, 2) NOT NULL,
	"platform_fee" numeric(12, 2) DEFAULT 0 NOT NULL,
	"shop_share" numeric(12, 2) NOT NULL,
	"recipient_pays_fees" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"refunded_amount" numeric(12, 2) DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_settlements_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "platform_gateways" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"api_key_enc" text,
	"webhook_secret_enc" text,
	"sandbox" boolean DEFAULT true NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"recipient_pays_fees" boolean DEFAULT true NOT NULL,
	"payout_hold_days" integer DEFAULT 0 NOT NULL,
	"last_test_at" timestamp with time zone,
	"last_test_ok" boolean,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_gateways_provider_unique" UNIQUE("provider")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_route" text DEFAULT 'own' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "route" text DEFAULT 'own' NOT NULL;--> statement-breakpoint
ALTER TABLE "saas_invoices" ADD COLUMN "gateway" text DEFAULT 'stripe' NOT NULL;--> statement-breakpoint
ALTER TABLE "saas_invoices" ADD COLUMN "gateway_ref" text;--> statement-breakpoint
ALTER TABLE "saas_invoices" ADD COLUMN "payment_url" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "payout_mode" text DEFAULT 'own' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "mamo_recipient_id" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "payout_account_name" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "payout_iban_enc" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "payout_iban_last4" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "billing_ref" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "auto_renew" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "order_settlements" ADD CONSTRAINT "order_settlements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_settlements" ADD CONSTRAINT "order_settlements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_settlements_tenant_idx" ON "order_settlements" USING btree ("tenant_id","status");