import "server-only";

function req(name: string, fallback?: string) {
  const v = process.env[name] || fallback; // empty string counts as unset
  if (v === undefined) throw new Error(`Missing env ${name}`);
  return v;
}

export const env = {
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  /** root domain used for tenant subdomains, e.g. quickprint.ae => desco.quickprint.ae */
  rootDomain: process.env.ROOT_DOMAIN ?? "localhost:3000",
  get authSecret() { return req("AUTH_SECRET", process.env.NODE_ENV === "production" ? undefined : "dev-insecure-secret-change-me-0123456789"); },
  get encryptionKey() { return req("ENCRYPTION_KEY", process.env.NODE_ENV === "production" ? undefined : "dev-encryption-key-change-me-0123456789"); },
  uploadDir: process.env.UPLOAD_DIR ?? "./.uploads",
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  /** platform Stripe account used for SaaS billing of print shops */
  platformStripeKey: process.env.PLATFORM_STRIPE_SECRET_KEY,
  platformStripeWebhookSecret: process.env.PLATFORM_STRIPE_WEBHOOK_SECRET,
  cronSecret: process.env.CRON_SECRET || "dev-cron",
};
