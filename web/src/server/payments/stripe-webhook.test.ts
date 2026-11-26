/** Stripe platform webhook endpoint: signature verification, not-configured answer, replays; plus the legacy-gateway retirement step. DB-backed. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { db, schema } from "@/db";
import { encrypt } from "@/lib/crypto";
import { POST } from "@/app/api/webhooks/stripe/route";
import { POST as aliasPost } from "@/app/api/webhooks/platform-stripe/route";
import { retireLegacyGateways } from "./platform";
import { LEGACY_PROVIDER, providerLabel } from "./legacy";

const SECRET = "whsec_test_webhook_secret_1234567890";
const stripe = new Stripe("sk_test_unit");
const payload = (id: string) => JSON.stringify({ id, object: "event", type: "customer.created", data: { object: { id: "cus_1" } } });
const signed = (body: string, secret = SECRET, ts = Math.floor(Date.now() / 1000)) => stripe.webhooks.generateTestHeaderString({ payload: body, secret, timestamp: ts });
const call = (body: string, sig?: string, handler: (r: Request) => Promise<Response> = POST) =>
  handler(new Request("http://localhost/api/webhooks/stripe", { method: "POST", body, headers: sig ? { "stripe-signature": sig } : {} }));

let prev: typeof schema.platformGateways.$inferSelect | undefined;
test("(setup) remember the saved Stripe gateway row", async () => { prev = await db.query.platformGateways.findFirst({ where: eq(schema.platformGateways.provider, "stripe") }); });
after(async () => { await db.delete(schema.platformGateways).where(eq(schema.platformGateways.provider, "stripe")); if (prev) await db.insert(schema.platformGateways).values(prev); });

test("webhook answers 503 until the gateway has a secret key and a webhook secret", async () => {
  await db.delete(schema.platformGateways).where(eq(schema.platformGateways.provider, "stripe"));
  const saved = { PLATFORM_STRIPE_SECRET_KEY: process.env.PLATFORM_STRIPE_SECRET_KEY, PLATFORM_STRIPE_WEBHOOK_SECRET: process.env.PLATFORM_STRIPE_WEBHOOK_SECRET };
  delete process.env.PLATFORM_STRIPE_SECRET_KEY; delete process.env.PLATFORM_STRIPE_WEBHOOK_SECRET;
  try { assert.equal((await call(payload("evt_a"), "t=1,v1=x")).status, 503); }
  finally { for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v; }
});

test("webhook verifies the Stripe signature: missing, tampered, wrong secret and stale timestamps are rejected; a valid one is accepted once", async () => {
  await db.delete(schema.platformGateways).where(eq(schema.platformGateways.provider, "stripe"));
  await db.insert(schema.platformGateways).values({ provider: "stripe", enabled: true, sandbox: true, apiKeyEnc: encrypt("sk_test_unit"), webhookSecretEnc: encrypt(SECRET) });
  const id = `evt_sig_${Date.now().toString(36)}`, body = payload(id);
  assert.equal((await call(body)).status, 400, "no signature header");
  assert.equal((await call(body, signed(body, "whsec_other"))).status, 400, "wrong secret");
  assert.equal((await call(body + " ", signed(body))).status, 400, "tampered body");
  assert.equal((await call(body, signed(body, SECRET, Math.floor(Date.now() / 1000) - 3600))).status, 400, "stale timestamp (replay)");
  const ok = await call(body, signed(body));
  assert.equal(ok.status, 200);
  const again = await (await call(body, signed(body))).json();
  assert.equal(again.duplicate, true, "same event id is processed once");
  assert.equal((await call(payload(id + "b"), signed(payload(id + "b")), aliasPost)).status, 200, "the old platform-stripe URL is an alias of the same handler");
  await db.delete(schema.paymentWebhookEvents).where(eq(schema.paymentWebhookEvents.eventId, id));
  await db.delete(schema.paymentWebhookEvents).where(eq(schema.paymentWebhookEvents.eventId, id + "b"));
});

test("legacy gateway rows are disabled by the idempotent retirement step and still label gracefully", async () => {
  const existing = await db.query.platformGateways.findFirst({ where: eq(schema.platformGateways.provider, LEGACY_PROVIDER) });
  try {
    if (existing) await db.update(schema.platformGateways).set({ enabled: true }).where(eq(schema.platformGateways.provider, LEGACY_PROVIDER));
    else await db.insert(schema.platformGateways).values({ provider: LEGACY_PROVIDER, enabled: true, sandbox: true });
    (globalThis as unknown as { __qpRetired?: boolean }).__qpRetired = false;
    await retireLegacyGateways();
    await retireLegacyGateways();
    assert.equal((await db.query.platformGateways.findFirst({ where: eq(schema.platformGateways.provider, LEGACY_PROVIDER) }))!.enabled, false);
  } finally {
    if (!existing) await db.delete(schema.platformGateways).where(eq(schema.platformGateways.provider, LEGACY_PROVIDER));
  }
  assert.equal(providerLabel("stripe"), "Stripe");
  assert.match(providerLabel(LEGACY_PROVIDER), /legacy/i);
  assert.equal(providerLabel("something_new"), "something_new");
  assert.equal(providerLabel(null), "Unknown");
});
