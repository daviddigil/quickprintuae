import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decrypt } from "@/lib/crypto";

export type PlatformProvider = "stripe" | "mamo";

export interface PlatformGatewayConfig {
  provider: PlatformProvider;
  enabled: boolean;
  sandbox: boolean;
  /** decrypted secret key (never send to the browser) */
  secretKey: string | null;
  webhookSecret: string | null;
  publishableKey: string | null;
  recipientPaysFees: boolean;
  payoutHoldDays: number;
  source: "db" | "env" | "none";
}

/**
 * The ONLY place gateway credentials are read. Keys live in `platform_gateways` (superadmin screen);
 * the legacy env vars (PLATFORM_STRIPE_SECRET_KEY, ...) are a fallback for the first deploy.
 * Shop owners never hold or see gateway keys.
 */
export async function getPlatformGateway(provider: PlatformProvider): Promise<PlatformGatewayConfig> {
  const row = await db.query.platformGateways.findFirst({ where: eq(schema.platformGateways.provider, provider) });
  const dec = (v?: string | null): string | null => { try { return v ? (decrypt(v) ?? null) : null; } catch { return null; } };
  if (row?.apiKeyEnc) {
    const extra = (row.config ?? {}) as { publishableKey?: string };
    return { provider, enabled: row.enabled, sandbox: row.sandbox, secretKey: dec(row.apiKeyEnc), webhookSecret: dec(row.webhookSecretEnc), publishableKey: extra.publishableKey ?? null, recipientPaysFees: row.recipientPaysFees, payoutHoldDays: row.payoutHoldDays, source: "db" };
  }
  const env = provider === "stripe"
    ? { key: process.env.PLATFORM_STRIPE_SECRET_KEY, hook: process.env.PLATFORM_STRIPE_WEBHOOK_SECRET, pub: process.env.PLATFORM_STRIPE_PUBLISHABLE_KEY as string | undefined }
    : { key: process.env.PLATFORM_MAMO_API_KEY, hook: process.env.PLATFORM_MAMO_WEBHOOK_SECRET, pub: undefined };
  if (env.key) return { provider, enabled: true, sandbox: !/^sk_live|^live/i.test(env.key), secretKey: env.key, webhookSecret: env.hook ?? null, publishableKey: env.pub ?? null, recipientPaysFees: true, payoutHoldDays: 0, source: "env" };
  return { provider, enabled: false, sandbox: true, secretKey: null, webhookSecret: null, publishableKey: null, recipientPaysFees: true, payoutHoldDays: 0, source: "none" };
}

/** Gateways that can take real money right now (enabled and keyed). */
export async function activeGateways(): Promise<PlatformProvider[]> {
  const out: PlatformProvider[] = [];
  for (const p of ["stripe", "mamo"] as const) { const g = await getPlatformGateway(p); if (g.enabled && g.secretKey) out.push(p); }
  return out;
}
