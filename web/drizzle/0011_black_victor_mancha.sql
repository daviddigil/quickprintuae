ALTER TABLE "tenants" ADD COLUMN "area" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "directory_listed" boolean DEFAULT true NOT NULL;