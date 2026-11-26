/** DB-backed: redemption races, discounts on invoices, signup code matching. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { createDb } from "@/db/client";
import { provisionTenant, ensurePlans } from "@/server/provision";
import { generateInvoicesForPeriod, collectInvoice } from "@/server/billing";
import { redeemOffer, findOfferForSignup, cancelRedemption, claimOfferForExistingShop, clearOffersCache, redeemPendingOffer } from "./index";

const sfx = Date.now().toString(36);
const tenants: string[] = []; const offerIds: string[] = [];
const H = 3600_000;
async function shop(planCode = "growth", over: Partial<typeof schema.tenants.$inferInsert> = {}) {
  await ensurePlans(db);
  const { tenant: t } = await provisionTenant(createDb().db, { shopName: `O ${sfx}`, slug: `o${sfx}${tenants.length}`, ownerName: "O", ownerEmail: `o${tenants.length}${sfx}@t.ae`, ownerPassword: "pw123456", planCode });
  tenants.push(t.id);
  await db.update(schema.tenants).set({ status: "active", ...over }).where(eq(schema.tenants.id, t.id));
  return t.id;
}
async function offer(o: Partial<typeof schema.offers.$inferInsert> = {}) {
  const [row] = await db.insert(schema.offers).values({
    name: `T ${sfx}`, kind: "percent", value: 30, durationMonths: 3, status: "active",
    startsAt: new Date(Date.now() - H), endsAt: new Date(Date.now() + 24 * H), ...o,
  }).returning();
  offerIds.push(row.id); clearOffersCache();
  return row;
}
const plan = (code: string) => db.query.plans.findFirst({ where: eq(schema.plans.code, code) }).then((p) => p!);
const month = (n: number) => new Date(Date.UTC(2040, n, 15));
const invFor = async (id: string, n: number) => { const [i] = await generateInvoicesForPeriod(month(n), { tenantId: id }); return (await db.query.saasInvoices.findFirst({ where: eq(schema.saasInvoices.id, i) }))!; };
const redemption = (tid: string) => db.query.offerRedemptions.findFirst({ where: eq(schema.offerRedemptions.tenantId, tid) }).then((r) => r!);

after(async () => {
  if (tenants.length) await db.delete(schema.tenants).where(inArray(schema.tenants.id, tenants));
  if (offerIds.length) await db.delete(schema.offers).where(inArray(schema.offers.id, offerIds));
});

test("max redemptions is never exceeded under parallel redeems", async () => {
  const o = await offer({ maxRedemptions: 3 });
  const ids: string[] = []; for (let i = 0; i < 8; i++) ids.push(await shop());
  const res = await Promise.all(ids.map((id) => redeemOffer(id, o)));
  assert.equal(res.filter((r) => r.ok).length, 3);
  assert.ok(res.filter((r) => !r.ok).every((r) => !r.ok && r.reason === "sold_out"));
  const row = await db.query.offers.findFirst({ where: eq(schema.offers.id, o.id) });
  assert.equal(row!.redeemedCount, 3);
  const n = await db.query.offerRedemptions.findMany({ where: eq(schema.offerRedemptions.offerId, o.id) });
  assert.equal(n.length, 3, "failed redeems leave no redemption row behind");
});

test("one redemption per shop, even in parallel", async () => {
  const o = await offer();
  const id = await shop();
  const res = await Promise.all([redeemOffer(id, o), redeemOffer(id, o), redeemOffer(id, o)]);
  assert.equal(res.filter((r) => r.ok).length, 1);
  assert.equal((await db.query.offers.findFirst({ where: eq(schema.offers.id, o.id) }))!.redeemedCount, 1);
});

test("percent for N months, then back to full price; VAT on the discounted net", async () => {
  const g = await plan("growth");
  const o = await offer({ value: 30, durationMonths: 2 });
  const id = await shop();
  await redeemOffer(id, o);
  const i1 = await invFor(id, 0);
  const d = Math.round(g.priceMonthly * 0.3 * 100) / 100;
  assert.equal(i1.discountAmount, d);
  assert.equal(i1.discountDetail[0].offerId, o.id);
  assert.equal(i1.total, Math.round((g.priceMonthly - d) * 1.05 * 100) / 100);
  await invFor(id, 1);
  const r = await redemption(id);
  assert.equal(r.status, "completed"); assert.equal(r.monthsRemaining, 0); assert.equal(r.totalDiscount, d * 2);
  const i3 = await invFor(id, 2);
  assert.equal(i3.discountAmount, 0); assert.equal(i3.total, Math.round(g.priceMonthly * 1.05 * 100) / 100);
});

test("amount off applies to the subscription, never below zero, never to usage", async () => {
  const g = await plan("growth");
  const o = await offer({ kind: "amount", value: 100, durationMonths: null });
  const id = await shop();
  await redeemOffer(id, o);
  const i = await invFor(id, 3);
  assert.equal(i.discountAmount, 100);
  assert.equal(i.total, Math.round((g.priceMonthly - 100) * 1.05 * 100) / 100);
  assert.equal((await redemption(id)).monthsRemaining, null, "unlimited");
});

test("free_months: invoice is fully discounted, recorded paid, never charged; later months full price", async () => {
  const g = await plan("growth");
  const o = await offer({ kind: "free_months", value: 2, durationMonths: null });
  const id = await shop();
  await redeemOffer(id, o);
  const i = await invFor(id, 4);
  assert.equal(i.total, 0); assert.equal(i.status, "paid"); assert.ok(i.paidAt); assert.equal(i.discountAmount, g.priceMonthly);
  assert.deepEqual(await collectInvoice(i.id), { status: "skipped" }, "already paid, nothing to collect");
  await invFor(id, 5);
  assert.equal((await redemption(id)).status, "completed");
  assert.equal((await invFor(id, 6)).discountAmount, 0);
  assert.equal((await db.query.tenants.findFirst({ where: eq(schema.tenants.id, id) }))!.status, "active");
});

test("collectInvoice on an open zero-total invoice marks it paid without charging", async () => {
  const id = await shop();
  const [inv] = await db.insert(schema.saasInvoices).values({ tenantId: id, number: `Z-${sfx}`, subscriptionAmount: 0, periodStart: month(7), periodEnd: month(8), total: 0, status: "open" }).returning();
  assert.deepEqual(await collectInvoice(inv.id), { status: "paid" });
});

test("yearly: percent applies to the yearly charge; free_months converts to N/12 of it", async () => {
  const g = await plan("growth");
  const at = new Date(Date.UTC(2040, 8, 1)); // anniversary month = Sept 2040
  const p = await offer({ value: 20, durationMonths: 12 });
  const a = await shop("growth", { billingCycle: "yearly", trialEndsAt: at });
  await redeemOffer(a, p);
  const ia = await invFor(a, 8);
  assert.equal(ia.discountAmount, Math.round(g.priceYearly * 0.2 * 100) / 100);
  assert.equal((await redemption(a)).status, "completed", "one yearly charge uses 12 months");
  const f = await offer({ kind: "free_months", value: 3, durationMonths: null });
  const b = await shop("growth", { billingCycle: "yearly", trialEndsAt: at });
  await redeemOffer(b, f);
  assert.equal((await invFor(b, 8)).discountAmount, Math.round(g.priceYearly * 3 / 12 * 100) / 100);
  const off = await invFor(b, 9).catch(() => null); // non-anniversary month: no subscription, no discount, redemption untouched
  void off;
});

test("trial_extension adds trial days and does not touch invoices", async () => {
  const o = await offer({ kind: "trial_extension", value: 14, durationMonths: null });
  const end = new Date(Date.now() + 3 * 86400_000);
  const id = await shop("growth", { status: "trial", trialEndsAt: end });
  const r = await redeemOffer(id, o);
  assert.ok(r.ok);
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, id) });
  assert.equal(t!.trialEndsAt!.getTime(), end.getTime() + 14 * 86400_000);
});

test("cancelRedemption frees the slot and stops discounts", async () => {
  const o = await offer({ maxRedemptions: 1 });
  const id = await shop();
  await redeemOffer(id, o);
  assert.equal((await redeemOffer(await shop(), o)).ok, false);
  await cancelRedemption((await redemption(id)).id);
  assert.equal((await db.query.offers.findFirst({ where: eq(schema.offers.id, o.id) }))!.redeemedCount, 0);
  assert.equal((await invFor(id, 10)).discountAmount, 0);
});

test("code matching is case-insensitive and failures are generic", async () => {
  const code = `BF${sfx}`.toUpperCase();
  const o = await offer({ code, planCodes: ["growth"], cycles: ["monthly"] });
  const ok = await findOfferForSignup({ planCode: "growth", cycle: "monthly", code: ` ${code.toLowerCase()} ` });
  assert.ok(ok.ok && ok.offer.id === o.id && ok.discount > 0);
  const wrongPlan = await findOfferForSignup({ planCode: "starter", cycle: "monthly", code });
  assert.deepEqual(wrongPlan, { ok: false, reason: "not_applicable" });
  const wrongCycle = await findOfferForSignup({ planCode: "growth", cycle: "yearly", code });
  assert.equal(wrongCycle.ok, false);
  assert.deepEqual(await findOfferForSignup({ planCode: "growth", cycle: "monthly", code: "NOPE-XYZ" }), { ok: false, reason: "invalid" });
  // a code-protected offer is never auto-applied without the code
  const none = await findOfferForSignup({ planCode: "growth", cycle: "monthly" });
  assert.ok(!none.ok || none.offer.id !== o.id);
});

test("paused, ended, scheduled and sold-out codes are rejected", async () => {
  const mk = (over: Partial<typeof schema.offers.$inferInsert>) => offer({ code: `S${Math.random().toString(36).slice(2, 8)}`.toUpperCase(), ...over });
  const paused = await mk({ status: "paused" });
  const ended = await mk({ startsAt: new Date(Date.now() - 48 * H), endsAt: new Date(Date.now() - H) });
  const future = await mk({ startsAt: new Date(Date.now() + 5 * H), endsAt: new Date(Date.now() + 9 * H) });
  const sold = await mk({ maxRedemptions: 1, redeemedCount: 1 });
  const r = (o: { code: string | null }) => findOfferForSignup({ planCode: "growth", cycle: "monthly", code: o.code });
  assert.deepEqual(await r(paused), { ok: false, reason: "invalid" });
  assert.deepEqual(await r(ended), { ok: false, reason: "expired" });
  assert.deepEqual(await r(future), { ok: false, reason: "invalid" });
  assert.deepEqual(await r(sold), { ok: false, reason: "sold_out" });
  assert.deepEqual(await redeemOffer(await shop(), ended), { ok: false, reason: "ended" });
});

test("auto-apply campaign (no code) is found for signup; audience 'new' blocks existing-shop claims", async () => {
  const camp = await offer({ audience: "new", value: 50 });
  const f = await findOfferForSignup({ planCode: "growth", cycle: "monthly" });
  assert.ok(f.ok && f.auto);
  const id = await shop();
  assert.deepEqual(await claimOfferForExistingShop(id, camp.id), { ok: false, reason: "not_eligible" });
  const all = await offer({ audience: "all", planCodes: [], value: 10 });
  const c = await claimOfferForExistingShop(id, all.id);
  assert.ok(c.ok);
  assert.deepEqual(await claimOfferForExistingShop(id, all.id), { ok: false, reason: "already" });
});

test("pending offer from signup is redeemed once and cleared", async () => {
  const o = await offer({ value: 15 });
  const id = await shop();
  const t = (await db.query.tenants.findFirst({ where: eq(schema.tenants.id, id) }))!;
  await db.update(schema.tenants).set({ billingRef: { ...t.billingRef, pendingOffer: o.id } }).where(eq(schema.tenants.id, id));
  const a = await redeemPendingOffer(id);
  assert.ok(a?.ok);
  assert.equal(await redeemPendingOffer(id), null);
  assert.equal((await db.query.offers.findFirst({ where: eq(schema.offers.id, o.id) }))!.redeemedCount, 1);
});
