CREATE TABLE "ai_design_quota" (
	"tenant_id" uuid NOT NULL,
	"subject_key" text NOT NULL,
	"period" text NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_design_quota_tenant_id_subject_key_period_pk" PRIMARY KEY("tenant_id","subject_key","period")
);
--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "ai_designs_per_customer" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_design_quota" ADD CONSTRAINT "ai_design_quota_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- AI designs per customer per month by plan: Starter 3, Growth 5, Enterprise 15 (pay-per-order plan 5)
UPDATE "plans" SET "ai_designs_per_customer" = 3 WHERE "code" = 'starter';
--> statement-breakpoint
UPDATE "plans" SET "ai_designs_per_customer" = 5 WHERE "code" IN ('growth', 'payg');
--> statement-breakpoint
UPDATE "plans" SET "ai_designs_per_customer" = 15 WHERE "code" = 'enterprise';
