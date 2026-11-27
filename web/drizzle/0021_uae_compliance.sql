CREATE TABLE "consent_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"user_id" uuid,
	"subject_key" text,
	"purpose" text NOT NULL,
	"granted" boolean NOT NULL,
	"version" text,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"order_id" uuid,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"url" text,
	"reporter_name" text,
	"reporter_email" text,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text,
	"handled_by" uuid,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"seq" integer NOT NULL,
	"number" text NOT NULL,
	"tenant_id" uuid,
	"order_id" uuid,
	"saas_invoice_id" uuid,
	"refers_to" text NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL,
	"vat" numeric(12, 2) NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'AED' NOT NULL,
	"reason" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_subject_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"user_id" uuid,
	"requester_email" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"note" text,
	"resolution" text,
	"due_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"handled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"contained_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"personal_data_involved" boolean DEFAULT false NOT NULL,
	"data_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"affected_tenant_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"affected_count" integer,
	"actions_taken" text,
	"notified_regulator_at" timestamp with time zone,
	"notified_subjects_at" timestamp with time zone,
	"notification_decision" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "rights_declared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "rights_declaration_version" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "legal_hold" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "declined_reason" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "legal_hold" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "returns_policy" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "complaint_email" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "marketing_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "marketing_opt_in_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "anonymised_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "consent_logs" ADD CONSTRAINT "consent_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_logs" ADD CONSTRAINT "consent_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_saas_invoice_id_saas_invoices_id_fk" FOREIGN KEY ("saas_invoice_id") REFERENCES "public"."saas_invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consent_logs_subject_idx" ON "consent_logs" USING btree ("tenant_id","user_id","purpose","created_at");--> statement-breakpoint
CREATE INDEX "content_reports_status_idx" ON "content_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_notes_scope_seq_idx" ON "credit_notes" USING btree ("scope","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_notes_order_total_idx" ON "credit_notes" USING btree ("order_id","total") WHERE "credit_notes"."order_id" is not null;--> statement-breakpoint
CREATE INDEX "dsr_tenant_status_idx" ON "data_subject_requests" USING btree ("tenant_id","status","due_at");