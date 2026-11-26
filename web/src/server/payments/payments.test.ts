/** DB-backed: platform webhook handling (idempotency, tenant/amount checks, refunds) and platform gateway admin. Run via `npm test`. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createDb } from "@/db/client";
import { provisionTenant } from "@/server/provision";
import { handleStripeOrderEvent } from "./stripe-events";
import { claimWebhookEvent, releaseWebhookEvent } from "./webhook-events";
import { gatewayView, saveGateway, testGateway } from "./gateway-admin";
import { decrypt } from "@/lib/crypto";
import Stripe from "stripe";
import { POST as stripePlatformHook } from "@/app/api/webhooks/stripe/route";
import { POST as stripeTenantHook } from "@/app/api/webhooks/stripe/[tenantId]/route";

const suffix = Date.now().toString(36);
const created: string[] = [];
let n = 0;
async function shopOrder(subtotal = 100) {
  const { tenant: t } = await provisionTenant(createDb().db, { shopName: `W ${suffix}`, slug: `wh${suffix}${created.length}`, ownerName: "O", ownerEmail: `w${created.length}${suffix}@t.ae`, ownerPassword: "pw123456" });
  created.push(t.id);
  const [o] = await db.insert(schema.orders).values({ tenantId: t.id, number: `WH-${suffix}-${n++}`, customerName: "C", customerEmail: "c@t.ae", customerPhone: "+971500000000", fulfillment: "pickup", subtotal, vat: subtotal * 0.05, total: subtotal * 1.05, status: "pending_payment" }).returning();
  await db.insert(schema.payments).values({ tenantId: t.id, orderId: o.id, provider: "stripe", providerRef: `cs_${o.id}`, amount: o.total, status: "pending" });
  return { t, o };
}
const ev = (type: string, object: unknown, id = `evt_${suffix}_${n++}`) => ({ id, type, data: { object } }) as unknown as Stripe.Event;
const session = (o: { id: string; total: number }, tenantId: string, over: Record<string, unknown> = {}) => ({ id: `cs_${o.id}`, payment_status: "paid", amount_total: Math.round(o.total * 100), metadata: { orderId: o.id, tenantId }, payment_intent: null, ...over });

after(async () => { for (const id of created) await db.delete(schema.tenants).where(eq(schema.tenants.id, id)); });

test("checkout.session.completed marks the order paid and writes ONE ledger row; the same event twice is processed once", async () => {
  const { t, o } = await shopOrder();
  const e = ev("checkout.session.completed", session(o, t.id));
  assert.equal(await claimWebhookEvent("stripe", e.id, e.type), true);
  assert.equal(await handleStripeOrderEvent(e), "paid");
  assert.equal(await claimWebhookEvent("stripe", e.id, e.type), false, "duplicate delivery is dropped");
  await handleStripeOrderEvent(e); // even if it were re-processed, nothing doubles
  assert.equal((await db.query.orders.findFirst({ where: eq(schema.orders.id, o.id) }))!.status, "paid");
  assert.equal((await db.select().from(schema.orderSettlements).where(eq(schema.orderSettlements.orderId, o.id))).length, 1);
  await releaseWebhookEvent("stripe", e.id);
  assert.equal(await claimWebhookEvent("stripe", e.id, e.type), true, "a failed event is released so the retry is handled");
  await releaseWebhookEvent("stripe", e.id);
});

test("an event naming another tenant, or the wrong amount, never marks an order paid", async () => {
  const a = await shopOrder(), b = await shopOrder();
  assert.equal(await handleStripeOrderEvent(ev("checkout.session.completed", session(a.o, b.t.id))), "ignored");
  assert.equal(await handleStripeOrderEvent(ev("checkout.session.completed", session(a.o, a.t.id, { amount_total: 100 }))), "amount mismatch");
  assert.equal(await handleStripeOrderEvent(ev("checkout.session.completed", session(a.o, a.t.id, { payment_status: "unpaid" }))), "ignored");
  assert.equal((await db.query.orders.findFirst({ where: eq(schema.orders.id, a.o.id) }))!.status, "pending_payment");
});

test("charge.refunded: full refund reverses the sale (order refunded, negative ledger row); partial is cumulative", async () => {
  const { t, o } = await shopOrder(200);
  await handleStripeOrderEvent(ev("checkout.session.completed", session(o, t.id)));
  const charge = (refunded: number) => ({ id: "ch_1", amount: 21000, amount_refunded: refunded, metadata: { orderId: o.id, tenantId: t.id }, payment_intent: null });
  await handleStripeOrderEvent(ev("charge.refunded", charge(5000)));
  await handleStripeOrderEvent(ev("charge.refunded", charge(5000)));
  const rows = () => db.select().from(schema.orderSettlements).where(and(eq(schema.orderSettlements.orderId, o.id), eq(schema.orderSettlements.kind, "refund")));
  assert.equal((await rows()).length, 1);
  await handleStripeOrderEvent(ev("charge.refunded", charge(21000)));
  assert.equal((await db.query.orders.findFirst({ where: eq(schema.orders.id, o.id) }))!.status, "refunded");
  assert.equal((await rows()).length, 2);
  const sum = (await rows()).reduce((a, r) => a + r.gross, 0);
  assert.equal(Math.round(sum * 100) / 100, -210);
});

test("the old per-shop webhook routes answer 410 Gone", async () => {
  for (const h of [stripeTenantHook]) {
    const r = await (h as unknown as () => Promise<Response> | Response)();
    assert.equal(r.status, 410); assert.match((await r.json()).message, /retired/i);
  }
});

test("platform gateway admin: secrets are encrypted at rest and never part of the view; blank keeps the saved key", async () => {
  const prev = await db.query.platformGateways.findFirst({ where: eq(schema.platformGateways.provider, "stripe") });
  const restore = async () => { await db.delete(schema.platformGateways).where(eq(schema.platformGateways.provider, "stripe")); if (prev) await db.insert(schema.platformGateways).values(prev); };
  try {
    await db.delete(schema.platformGateways).where(eq(schema.platformGateways.provider, "stripe"));
    const bad = await saveGateway("stripe", { secretKey: "nope", sandbox: true, enabled: false, recipientPaysFees: true, payoutHoldDays: 0 });
    assert.equal(bad.ok, false);
    assert.equal((await saveGateway("stripe", { sandbox: true, enabled: true, recipientPaysFees: true, payoutHoldDays: 0 })).ok, false, "cannot enable without a key");
    const ok = await saveGateway("stripe", { secretKey: "sk_test_ABCDEFGHIJKLMNOP1234", webhookSecret: "whsec_secretvalue9876", publishableKey: "pk_test_pub", sandbox: true, enabled: true, recipientPaysFees: false, payoutHoldDays: 7 });
    assert.ok(ok.ok); if (ok.ok) assert.ok(ok.changed.includes("secret key"));
    const row = (await db.query.platformGateways.findFirst({ where: eq(schema.platformGateways.provider, "stripe") }))!;
    assert.ok(!row.apiKeyEnc!.includes("sk_test")); assert.equal(decrypt(row.apiKeyEnc), "sk_test_ABCDEFGHIJKLMNOP1234"); assert.equal(row.payoutHoldDays, 7);
    const view = JSON.stringify(await gatewayView("stripe"));
    assert.ok(!view.includes("ABCDEFGHIJKLMNOP") && !view.includes("secretvalue") && view.includes("1234"), "only the last 4 are shown");
    await saveGateway("stripe", { sandbox: true, enabled: true, recipientPaysFees: false, payoutHoldDays: 7 });
    assert.equal(decrypt((await db.query.platformGateways.findFirst({ where: eq(schema.platformGateways.provider, "stripe") }))!.apiKeyEnc), "sk_test_ABCDEFGHIJKLMNOP1234");
    assert.equal((await saveGateway("stripe", { secretKey: "sk_live_ZZZZZZZZZZZZ", sandbox: true, enabled: false, recipientPaysFees: true, payoutHoldDays: 0 })).ok, false, "live key with Sandbox ticked is refused");
    process.env.PAYMENTS_FAKE = "1";
    assert.equal((await testGateway("stripe")).ok, true, "fake mode never calls the gateway");
  } finally { delete process.env.PAYMENTS_FAKE; await restore(); }
});

test("platform Stripe webhook: verifies the signature, processes an event once, rejects forged and replayed-with-bad-signature requests", async () => {
  const prev = await db.query.platformGateways.findFirst({ where: eq(schema.platformGateways.provider, "stripe") });
  const WH = "whsec_unit_test_secret";
  try {
    await db.delete(schema.platformGateways).where(eq(schema.platformGateways.provider, "stripe"));
    assert.ok((await saveGateway("stripe", { secretKey: "sk_test_unit0000000000", webhookSecret: WH, sandbox: true, enabled: true, recipientPaysFees: true, payoutHoldDays: 0 })).ok);
    const { t, o } = await shopOrder();
    const payload = JSON.stringify(ev("checkout.session.completed", session(o, t.id)));
    const call = (body: string, sig: string) => stripePlatformHook(new Request("http://x/api/webhooks/stripe", { method: "POST", body, headers: { "stripe-signature": sig } }));
    const good = new Stripe("sk_test_unit0000000000").webhooks.generateTestHeaderString({ payload, secret: WH });
    assert.equal((await call(payload, "t=1,v1=deadbeef")).status, 400, "forged signature");
    assert.equal((await call(payload.replace("paid", "pAid"), good)).status, 400, "tampered body");
    assert.equal((await db.query.orders.findFirst({ where: eq(schema.orders.id, o.id) }))!.status, "pending_payment");
    const r1 = await call(payload, good); assert.equal(r1.status, 200); assert.equal((await r1.json()).handled, "paid");
    const r2 = await call(payload, good); assert.equal((await r2.json()).duplicate, true, "replay is a no-op");
    assert.equal((await db.query.orders.findFirst({ where: eq(schema.orders.id, o.id) }))!.status, "paid");
    const old = new Stripe("sk_test_unit0000000000").webhooks.generateTestHeaderString({ payload, secret: WH, timestamp: Math.floor(Date.now() / 1000) - 3600 });
    assert.equal((await call(payload, old)).status, 400, "an hour-old signature is refused (replay window)");
  } finally { await db.delete(schema.platformGateways).where(eq(schema.platformGateways.provider, "stripe")); if (prev) await db.insert(schema.platformGateways).values(prev); }
});
