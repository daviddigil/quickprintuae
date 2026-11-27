import { fakeFlag as runtimeFake } from "@/lib/runtime";
import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { getPlatformGateway, type PlatformProvider } from "./platform";
import { testPaymentCredentials } from "./index";

export const PROVIDERS: { code: PlatformProvider; name: string; blurb: string }[] = [
  { code: "stripe", name: "Stripe", blurb: "Cards, Apple Pay, Google Pay. Keys: dashboard.stripe.com, Developers, API keys." },
];

/** Events the platform webhook (/api/webhooks/stripe) handles; the superadmin page lists exactly these. */
export const STRIPE_EVENTS = ["checkout.session.completed", "payment_intent.succeeded", "charge.refunded", "charge.dispute.created", "charge.dispute.closed", "setup_intent.succeeded", "setup_intent.setup_failed"] as const;

export interface GatewayInput {
  secretKey?: string; webhookSecret?: string; publishableKey?: string;
  sandbox: boolean; enabled: boolean; recipientPaysFees: boolean; payoutHoldDays: number;
}

const last4 = (s?: string | null) => (s ? `••••${s.slice(-4)}` : null);

/** Everything the superadmin page may show: never the secrets themselves, only whether they are saved and their last 4. */
export async function gatewayView(provider: PlatformProvider) {
  const g = await getPlatformGateway(provider);
  const row = await db.query.platformGateways.findFirst({ where: eq(schema.platformGateways.provider, provider) });
  const checks = [
    { key: "secret", label: "Secret key", ok: !!g.secretKey, hint: "Paste it below and save." },
    { key: "webhook", label: "Webhook signing secret", ok: !!g.webhookSecret, hint: "Create the webhook endpoint in Stripe, then paste its signing secret (whsec_…)." },
    { key: "pub", label: "Publishable key", ok: !!g.publishableKey, hint: "Needed for card-on-file at signup (pk_…)." },
    { key: "tested", label: "Credentials tested", ok: row?.lastTestOk === true, hint: "Press Test credentials." },
    { key: "enabled", label: "Enabled at checkout", ok: g.enabled, hint: "Tick Enabled and save." },
  ];
  return {
    provider, enabled: g.enabled, sandbox: g.sandbox, recipientPaysFees: g.recipientPaysFees, payoutHoldDays: g.payoutHoldDays, source: g.source,
    secretMask: last4(g.secretKey), webhookMask: last4(g.webhookSecret), publishableKey: g.publishableKey,
    lastTestAt: row?.lastTestAt ?? null, lastTestOk: row?.lastTestOk ?? null,
    webhookUrl: `${env.appUrl}/api/webhooks/stripe`, checks, ready: checks.every((c) => c.ok),
    fake: runtimeFake("PAYMENTS_FAKE"),
  };
}

export type SaveGatewayResult = { ok: true; changed: string[] } | { ok: false; error: string };

/** Upsert a platform gateway. Secrets are encrypted; blank secret fields keep what is saved. Returns the NAMES of what changed (for the audit log, never values). */
export async function saveGateway(provider: PlatformProvider, input: GatewayInput): Promise<SaveGatewayResult> {
  const sk = input.secretKey?.trim(), wh = input.webhookSecret?.trim(), pk = input.publishableKey?.trim();
  if (provider === "stripe") {
    if (sk && !/^(sk|rk)_(test|live)_/.test(sk)) return { ok: false, error: "A Stripe secret key starts with sk_live_ or sk_test_ (or rk_ for a restricted key)." };
    if (pk && !/^pk_(test|live)_/.test(pk)) return { ok: false, error: "A Stripe publishable key starts with pk_live_ or pk_test_." };
    if (sk && /_live_/.test(sk) && input.sandbox) return { ok: false, error: "That is a live key but Sandbox is ticked. Untick Sandbox to use live keys." };
    if (sk && /_test_/.test(sk) && !input.sandbox) return { ok: false, error: "That is a test key but Sandbox is not ticked." };
  }
  if (!Number.isInteger(input.payoutHoldDays) || input.payoutHoldDays < 0 || input.payoutHoldDays > 60) return { ok: false, error: "Hold days must be a whole number from 0 to 60." };
  const row = await db.query.platformGateways.findFirst({ where: eq(schema.platformGateways.provider, provider) });
  const haveKey = !!(sk || row?.apiKeyEnc);
  if (input.enabled && !haveKey) return { ok: false, error: "Add the secret key before enabling this gateway." };
  const cfg = { ...(row?.config ?? {}), ...(pk ? { publishableKey: pk } : {}) };
  const values = {
    sandbox: input.sandbox, enabled: input.enabled, recipientPaysFees: input.recipientPaysFees, payoutHoldDays: input.payoutHoldDays,
    ...(sk ? { apiKeyEnc: encrypt(sk), lastTestOk: null, lastTestAt: null } : {}), ...(wh ? { webhookSecretEnc: encrypt(wh) } : {}),
    config: cfg, updatedAt: new Date(),
  };
  const changed = [
    sk && "secret key", wh && "webhook secret", pk && "publishable key",
    (!row || row.sandbox !== input.sandbox) && "sandbox", (!row || row.enabled !== input.enabled) && "enabled",
    (!row || row.recipientPaysFees !== input.recipientPaysFees) && "recipient pays fees", (!row || row.payoutHoldDays !== input.payoutHoldDays) && "hold days",
  ].filter(Boolean) as string[];
  if (row) await db.update(schema.platformGateways).set(values).where(eq(schema.platformGateways.id, row.id));
  else await db.insert(schema.platformGateways).values({ provider, ...values });
  return { ok: true, changed };
}

/** Test the typed key, or the saved key when none was typed. Records the result on the row. */
export async function testGateway(provider: PlatformProvider, typedKey?: string) {
  const g = await getPlatformGateway(provider);
  const key = typedKey?.trim() || g.secretKey;
  if (!key) return { ok: false, message: "Enter or save a key first." };
  const r = await testPaymentCredentials(provider, { secretKey: key });
  if (!typedKey?.trim()) {
    await db.update(schema.platformGateways).set({ lastTestAt: new Date(), lastTestOk: r.ok }).where(eq(schema.platformGateways.provider, provider));
  }
  return r;
}
