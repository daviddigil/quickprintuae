ALTER TYPE "public"."tenant_status" ADD VALUE 'incomplete';--> statement-breakpoint
CREATE TABLE "blocklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"reason" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_holder_name" text NOT NULL,
	"bank_name" text NOT NULL,
	"iban_enc" text NOT NULL,
	"iban_last4" text NOT NULL,
	"iban_hash" text NOT NULL,
	"account_number_enc" text,
	"swift" text,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"reason" text,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payout_accounts_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "payout_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_amount" numeric(12, 2) DEFAULT 0 NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"bank_reference" text,
	"created_by" uuid,
	"approved_by" uuid,
	"paid_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	CONSTRAINT "payout_batches_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "payout_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"carried_forward" numeric(12, 2) DEFAULT 0 NOT NULL,
	"bank_snapshot" jsonb NOT NULL,
	"settlement_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seller_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"legal_name" text NOT NULL,
	"legal_name_norm" text NOT NULL,
	"licence_number" text NOT NULL,
	"licence_number_norm" text NOT NULL,
	"authority" text NOT NULL,
	"licence_expiry" timestamp with time zone,
	"activity" text,
	"signatory_name" text,
	"trn" text,
	"document_key" text,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"reason" text,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reviewer_id" uuid,
	"reviewed_at" timestamp with time zone,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "seller_verifications_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
ALTER TABLE "order_settlements" ADD COLUMN "gateway_fee" numeric(12, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_settlements" ADD COLUMN "commission" numeric(12, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_settlements" ADD COLUMN "net_amount" numeric(12, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_settlements" ADD COLUMN "available_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_settlements" ADD COLUMN "payout_item_id" uuid;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "verification_status" text DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "card_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "card_fingerprint_hash" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "payout_hold_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_canonical" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_canonical" text;--> statement-breakpoint
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_items" ADD CONSTRAINT "payout_items_batch_id_payout_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."payout_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_items" ADD CONSTRAINT "payout_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_verifications" ADD CONSTRAINT "seller_verifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "blocklist_kind_value_idx" ON "blocklist" USING btree ("kind","value");--> statement-breakpoint
CREATE UNIQUE INDEX "payout_accounts_iban_idx" ON "payout_accounts" USING btree ("iban_hash") WHERE "payout_accounts"."status" <> 'rejected';--> statement-breakpoint
CREATE INDEX "payout_items_batch_idx" ON "payout_items" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "payout_items_tenant_idx" ON "payout_items" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_verif_licence_idx" ON "seller_verifications" USING btree ("licence_number_norm") WHERE "seller_verifications"."status" <> 'rejected';--> statement-breakpoint
CREATE UNIQUE INDEX "seller_verif_name_idx" ON "seller_verifications" USING btree ("legal_name_norm") WHERE "seller_verifications"."status" <> 'rejected';--> statement-breakpoint
CREATE INDEX "seller_verif_status_idx" ON "seller_verifications" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_owner_email_canonical_idx" ON "users" USING btree ("email_canonical") WHERE "users"."role" = 'owner' and "users"."email_canonical" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "users_owner_phone_canonical_idx" ON "users" USING btree ("phone_canonical") WHERE "users"."role" = 'owner' and "users"."phone_canonical" is not null;
--> statement-breakpoint
-- backfill canonical keys for existing owners (the app fills exact canonical forms on every container start); platform mode for payouts
UPDATE "users" SET "email_canonical" = lower("email") WHERE "role" = 'owner' AND "email_canonical" IS NULL;
--> statement-breakpoint
UPDATE "tenants" SET "payout_mode" = 'platform';
--> statement-breakpoint
-- existing real shops need verification; the demo shop is exempt
UPDATE "tenants" SET "verification_status" = 'verified' WHERE "slug" = 'demo';
