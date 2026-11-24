ALTER TABLE "banners" ADD COLUMN "cta_label" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "banners" ADD COLUMN "starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "banners" ADD COLUMN "ends_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "plans" SET "flags" = '["walk_in_queue"]'::jsonb WHERE "code" = 'starter';
