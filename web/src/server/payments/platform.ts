import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { LEGACY_PLAN_FEATURE, LEGACY_PROVIDER } from "./legacy";
import { db, schema } from "@/db";
import { decrypt } from "@/lib/crypto";

/** Stripe is the only payment gateway. (Rows of other providers in platform_gateways are legacy history and are never used.) */
export type PlatformProvider = "stripe";

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
  const env = { key: process.env.PLATFORM_STRIPE_SECRET_KEY, hook: process.env.PLATFORM_STRIPE_WEBHOOK_SECRET, pub: process.env.PLATFORM_STRIPE_PUBLISHABLE_KEY as string | undefined };
  if (env.key) return { provider, enabled: true, sandbox: !/^sk_live|^live/i.test(env.key), secretKey: env.key, webhookSecret: env.hook ?? null, publishableKey: env.pub ?? null, recipientPaysFees: true, payoutHoldDays: 0, source: "env" };
  return { provider, enabled: false, sandbox: true, secretKey: null, webhookSecret: null, publishableKey: null, recipientPaysFees: true, payoutHoldDays: 0, source: "none" };
}

/** Gateways that can take real money right now (enabled and keyed). */
export async function activeGateways(): Promise<PlatformProvider[]> {
  await retireLegacyGateways();
  const g = await getPlatformGateway("stripe");
  return g.enabled && g.secretKey ? ["stripe"] : [];
}

/**
 * Idempotent clean-up of the removed second-gateway integration (history is kept, nothing is dropped): any platform_gateways row of a provider
 * other than stripe/meta_whatsapp is disabled, and the old plan feature text is rewritten. Runs once per process; safe to run any time.
 */
const retired = globalThis as unknown as { __qpRetired?: boolean };
export async function retireLegacyGateways() {
  if (retired.__qpRetired) return;
  try {
    await db.update(schema.platformGateways).set({ enabled: false, updatedAt: new Date() })
      .where(and(eq(schema.platformGateways.provider, LEGACY_PROVIDER), eq(schema.platformGateways.enabled, true)));
    await db.execute(sql`UPDATE plans SET features = replace(features::text, ${LEGACY_PLAN_FEATURE}, 'Stripe payments')::jsonb WHERE features::text LIKE ${"%" + LEGACY_PLAN_FEATURE + "%"}`);
    retired.__qpRetired = true;
  } catch (e) { console.error("[payments] retireLegacyGateways failed", e); }
}
