ALTER TABLE "whatsapp_accounts" ADD COLUMN "connection_method" text DEFAULT 'embedded' NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_accounts" ADD COLUMN "app_secret_enc" text;--> statement-breakpoint
ALTER TABLE "whatsapp_accounts" ADD COLUMN "verify_token" text;--> statement-breakpoint
ALTER TABLE "whatsapp_accounts" ADD COLUMN "last_webhook_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD COLUMN "cart" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD COLUMN "needs_human" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD COLUMN "needs_human_reason" text;