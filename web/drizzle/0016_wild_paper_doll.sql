CREATE TABLE "payment_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"type" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_settlements" DROP CONSTRAINT "order_settlements_order_id_unique";--> statement-breakpoint
ALTER TABLE "tenants" ALTER COLUMN "payout_mode" SET DEFAULT 'platform';--> statement-breakpoint
ALTER TABLE "order_settlements" ADD COLUMN "kind" text DEFAULT 'sale' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_settlements" ADD COLUMN "external_ref" text;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_webhook_events_idx" ON "payment_webhook_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_settlements_sale_idx" ON "order_settlements" USING btree ("order_id") WHERE "order_settlements"."kind" = 'sale';--> statement-breakpoint
CREATE UNIQUE INDEX "order_settlements_ref_idx" ON "order_settlements" USING btree ("external_ref") WHERE "order_settlements"."external_ref" is not null;