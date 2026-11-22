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
  /** open-source / self-hosted image model behind an OpenAI-compatible /v1/images/generations endpoint */
  imageApiUrl: process.env.IMAGE_API_URL || undefined,
  imageApiKey: process.env.IMAGE_API_KEY || undefined,
  imageApiModel: process.env.IMAGE_API_MODEL || "qwen-image",
  metaAppId: process.env.META_APP_ID || undefined,
  metaAppSecret: process.env.META_APP_SECRET || undefined,
  metaVerifyToken: process.env.META_VERIFY_TOKEN || undefined,
  metaEmbeddedSignupConfigId: process.env.META_EMBEDDED_SIGNUP_CONFIG_ID || undefined,
  metaGraphVersion: process.env.META_GRAPH_VERSION || "v21.0",
  geminiKey: process.env.GEMINI_API_KEY || undefined,
  geminiImageModel: process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image",
  /** platform Stripe account used for SaaS billing of print shops */
  platformStripeKey: process.env.PLATFORM_STRIPE_SECRET_KEY,
  platformStripeWebhookSecret: process.env.PLATFORM_STRIPE_WEBHOOK_SECRET,
  cronSecret: process.env.CRON_SECRET || "dev-cron",
};
