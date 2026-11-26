/** DB-backed: payout ledger, commission netting, refunds, batches, maker-checker, IBAN guard, 48 h hold, tenant isolation. Run via `npm test`. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { createDb } from "@/db/client";
import { provisionTenant } from "@/server/provision";
import { markOrderPaid, setOrderStatus } from "@/server/orders";
import { generateInvoicesForPeriod } from "@/server/billing";
import { estimateGatewayFee } from "@/lib/payouts";
import bcrypt from "bcryptjs";
import { applyRefund, balances, closeChargeback, openChargeback, promoteAvailable, recordSettlementForOrder, tenantsWithOpenDispute } from "./ledger";
import { ibanHash, reviewPayoutAccount, savePayoutAccount } from "./account";
import { approveBatch, batchCsv, cancelBatch, createBatch, markBatchPaid, previewBatch } from "./batches";
import { shopStatement } from "./statement";

const suffix = Date.now().toString(36);
const created: string[] = [];
const extraUsers: string[] = [];
const PLAN = `pz${suffix}`;
let planId = "";
let n = 0;

const RUN = String(Date.now()).slice(-8);
const mod97 = (s: string) => { let r = 0; for (const ch of s) r = (r * 10 + Number(ch)) % 97; return r; };
/** a valid UAE IBAN for a 16-digit account number */
function iban(acct: string) {
  const bban = "033" + acct.slice(0, 6) + acct.slice(-2) + RUN; // bank code + 16-digit account, unique per run and seed
  const check = String(98 - mod97(bban + "101400")).padStart(2, "0"); // A=10,E=14 -> "1014" + "00"
  return `AE${check}${bban}`;
}

async function shop(opts: { status?: "trial" | "active"; verified?: boolean; mode?: "own" | "platform"; hold?: Date | null } = {}) {
  if (!planId) { const [p] = await db.insert(schema.plans).values({ code: PLAN, name: "T", priceMonthly: 499, priceYearly: 4990, orderFeePct: 1, sortOrder: 99, active: false }).returning(); planId = p.id; }
  const { tenant: t, owner } = await provisionTenant(createDb().db, { shopName: `P ${suffix}`, slug: `pz${suffix}${created.length}`, ownerName: "O", ownerEmail: `o${created.length}${suffix}@t.ae`, ownerPassword: "pw123456", planCode: PLAN }) as { tenant: typeof schema.tenants.$inferSelect; owner?: { id: string } };
  created.push(t.id);
  await db.update(schema.tenants).set({ status: opts.status ?? "active", verificationStatus: opts.verified === false ? "unverified" : "verified", payoutMode: opts.mode ?? "platform", payoutHoldUntil: opts.hold ?? null }).where(eq(schema.tenants.id, t.id));
  const o = owner ?? (await db.query.users.findFirst({ where: and(eq(schema.users.tenantId, t.id), eq(schema.users.role, "owner")) }))!;
  return { t: (await db.query.tenants.findFirst({ where: eq(schema.tenants.id, t.id) }))!, ownerId: o.id };
}
async function order(tenantId: string, subtotal: number) {
  const [o] = await db.insert(schema.orders).values({
    tenantId, number: `PZ-${suffix}-${n++}`, customerName: "C", customerEmail: "c@t.ae", customerPhone: "+971500000000", fulfillment: "pickup",
    subtotal, vat: subtotal * 0.05, total: subtotal * 1.05, status: "pending_payment",
  }).returning();
  await db.insert(schema.orderItems).values({ orderId: o.id, productName: "Doc", kind: "document", quantity: 1, unitPrice: subtotal, lineTotal: subtotal });
  return o;
}
const pay = (id: string) => markOrderPaid(id, "stripe", `ref-${id}`);
const sale = (orderId: string) => db.query.orderSettlements.findFirst({ where: and(eq(schema.orderSettlements.orderId, orderId), eq(schema.orderSettlements.kind, "sale")) });
const comm = (orderId: string) => db.query.orderCommissions.findFirst({ where: eq(schema.orderCommissions.orderId, orderId) });
/** a shop that can be paid: verified + approved bank account, hold passed */
async function payable(accountSeed: string, opts: Parameters<typeof shop>[0] = {}) {
  const s = await shop(opts);
  const r = await savePayoutAccount(s.t.id, s.ownerId, { holderName: "Shop LLC", bankName: "Emirates NBD", iban: iban(accountSeed) });
  assert.ok(r.ok, JSON.stringify(r));
  const acc = (await db.query.payoutAccounts.findFirst({ where: eq(schema.payoutAccounts.tenantId, s.t.id) }))!;
  await reviewPayoutAccount(acc.id, s.ownerId, "verified");
  await db.update(schema.tenants).set({ payoutHoldUntil: null }).where(eq(schema.tenants.id, s.t.id));
  return s;
}
async function paidOrder(tenantId: string, subtotal: number) { const o = await order(tenantId, subtotal); await pay(o.id); return o; }
const later = new Date(Date.now() + 3600_000);

after(async () => {
  const items = created.length ? await db.select().from(schema.payoutItems).where(inArray(schema.payoutItems.tenantId, created)) : [];
  if (items.length) { await db.delete(schema.payoutItems).where(inArray(schema.payoutItems.id, items.map((i) => i.id))); await db.delete(schema.payoutBatches).where(inArray(schema.payoutBatches.id, [...new Set(items.map((i) => i.batchId))])); }
  for (const id of created) await db.delete(schema.tenants).where(eq(schema.tenants.id, id));
  if (extraUsers.length) await db.delete(schema.users).where(inArray(schema.users.id, extraUsers));
  if (planId) await db.delete(schema.plans).where(eq(schema.plans.id, planId));
});

test("ledger: paying an order creates ONE settlement (gross, estimated fee, commission, net, pending) and is idempotent", async () => {
  const { t } = await shop(); const o = await order(t.id, 200);
  assert.equal(await pay(o.id), true);
  assert.equal(await pay(o.id), false);
  await recordSettlementForOrder(o.id); await recordSettlementForOrder(o.id);
  const rows = await db.select().from(schema.orderSettlements).where(eq(schema.orderSettlements.orderId, o.id));
  assert.equal(rows.length, 1);
  const s = rows[0], fee = estimateGatewayFee(210);
  assert.equal(s.gross, 210); assert.equal(s.gatewayFee, fee); assert.equal(s.commission, 2);
  assert.equal(s.netAmount, Math.round((210 - 2 - fee) * 100) / 100);
  assert.equal(s.status, "pending"); assert.equal(s.kind, "sale"); assert.ok(s.availableAt);
});

test("ledger: a real gateway fee overrides the estimate", async () => {
  const { t } = await shop(); const o = await order(t.id, 100);
  await markOrderPaid(o.id, "stripe", "x-" + o.id, {}, { gatewayFee: 3.5 });
  const s = (await sale(o.id))!; assert.equal(s.gatewayFee, 3.5); assert.equal(s.netAmount, 105 - 1 - 3.5);
});

test("commission is NETTED from the payout and never billed on the invoice too (platform mode)", async () => {
  const { t } = await shop(); const a = await paidOrder(t.id, 200), b = await paidOrder(t.id, 100);
  assert.equal((await comm(a.id))!.status, "settled"); assert.equal((await sale(a.id))!.commission, 2);
  const ids = await generateInvoicesForPeriod(new Date(), { tenantId: t.id });
  assert.equal(ids.length, 1);
  const inv = (await db.query.saasInvoices.findFirst({ where: eq(schema.saasInvoices.id, ids[0]) }))!;
  assert.equal(inv.orderFeeAmount, 0, "no commission on the invoice: it was netted from the payout");
  assert.equal(inv.subscriptionAmount, 499);
  assert.equal((await comm(a.id))!.status, "settled"); assert.equal((await comm(b.id))!.invoiceId, null);
});

test("legacy 'own' mode still invoices the commission and leaves the ledger commission at 0", async () => {
  const { t } = await shop({ mode: "own" }); const o = await paidOrder(t.id, 200);
  assert.equal((await comm(o.id))!.status, "accrued"); assert.equal((await sale(o.id))!.commission, 0);
});

test("trial shops follow the same rules: waived commission is 0 in the ledger, the sale is still recorded", async () => {
  const { t } = await shop({ status: "trial" }); const o = await paidOrder(t.id, 300);
  assert.equal((await comm(o.id))!.status, "waived"); const s = (await sale(o.id))!; assert.equal(s.commission, 0); assert.ok(s.netAmount > 0);
});

test("an already-invoiced commission is not netted again", async () => {
  const { t } = await shop({ mode: "own" }); const o = await paidOrder(t.id, 200);
  await generateInvoicesForPeriod(new Date(), { tenantId: t.id });
  await db.update(schema.tenants).set({ payoutMode: "platform" }).where(eq(schema.tenants.id, t.id));
  await db.delete(schema.orderSettlements).where(eq(schema.orderSettlements.orderId, o.id));
  assert.equal((await recordSettlementForOrder(o.id))!.commission, 0);
});

test("hold days: pending -> available only once availableAt has passed", async () => {
  const { t } = await shop(); const o = await paidOrder(t.id, 100);
  await db.update(schema.orderSettlements).set({ availableAt: new Date(Date.now() + 86_400_000) }).where(eq(schema.orderSettlements.orderId, o.id));
  await promoteAvailable(); assert.equal((await sale(o.id))!.status, "pending");
  await db.update(schema.orderSettlements).set({ availableAt: new Date(Date.now() - 1000) }).where(eq(schema.orderSettlements.orderId, o.id));
  await promoteAvailable(); assert.equal((await sale(o.id))!.status, "available");
});

test("refund: appends a NEGATIVE row (past rows untouched), partial refunds are cumulative and idempotent", async () => {
  const { t } = await shop(); const o = await paidOrder(t.id, 200);
  await promoteAvailable();
  const before = (await sale(o.id))!;
  const r1 = await applyRefund(o.id, 105); assert.ok(r1);
  assert.equal(r1!.netAmount, -Math.round(105 * ((210 - 2) / 210) * 100) / 100); assert.equal(r1!.kind, "refund"); assert.equal(r1!.status, "available");
  assert.equal(await applyRefund(o.id, 105), null, "same cumulative amount = replay, nothing new");
  const r2 = await applyRefund(o.id, 210); assert.ok(r2);
  const all = await db.select().from(schema.orderSettlements).where(eq(schema.orderSettlements.orderId, o.id));
  assert.equal(all.length, 3);
  const after = (await sale(o.id))!; assert.equal(after.netAmount, before.netAmount, "the sale row's amounts are never edited");
  const total = all.reduce((a, r) => a + r.netAmount, 0);
  assert.equal(Math.round(total * 100) / 100, -before.gatewayFee, "fully refunded: the shop only bears the gateway fee");
});

test("refund via order status posts the reversal and reverses the netted commission", async () => {
  const { t } = await shop(); const o = await paidOrder(t.id, 100);
  await setOrderStatus(o.id, "refunded", "customer refund");
  assert.equal((await comm(o.id))!.status, "refunded");
  assert.equal((await db.select().from(schema.orderSettlements).where(and(eq(schema.orderSettlements.orderId, o.id), eq(schema.orderSettlements.kind, "refund")))).length, 1);
  await setOrderStatus(o.id, "refunded", "again");
  assert.equal((await db.select().from(schema.orderSettlements).where(and(eq(schema.orderSettlements.orderId, o.id), eq(schema.orderSettlements.kind, "refund")))).length, 1, "no double reversal");
});

test("refund carries forward: a negative row reduces the NEXT batch for that shop", async () => {
  const s = await payable("1000000000000001");
  const old = await paidOrder(s.t.id, 300); await promoteAvailable();
  assert.ok((await createBatch(s.ownerId, later, 1, [s.t.id])).ok);
  const b1 = (await db.query.payoutItems.findFirst({ where: eq(schema.payoutItems.tenantId, s.t.id) }))!;
  const batch = (await db.query.payoutBatches.findFirst({ where: eq(schema.payoutBatches.id, b1.batchId) }))!;
  assert.ok((await approveBatch(batch.id, "00000000-0000-0000-0000-000000000001", { passwordConfirmed: false, admins: 2 })).ok);
  assert.ok((await markBatchPaid(batch.id, s.ownerId, "BANK-1")).ok);
  await applyRefund(old.id, old.total); // after the money was already paid out
  const fresh = await paidOrder(s.t.id, 900); await promoteAvailable();
  const plan = await previewBatch(later, 1);
  const line = plan.lines.find((l) => l.tenantId === s.t.id)!;
  const freshNet = (await sale(fresh.id))!.netAmount;
  const refundRow = (await db.select().from(schema.orderSettlements).where(and(eq(schema.orderSettlements.orderId, old.id), eq(schema.orderSettlements.kind, "refund"))))[0];
  assert.equal(line.amount, Math.round((freshNet + refundRow.netAmount) * 100) / 100);
  assert.equal(line.carriedForward, refundRow.netAmount);
});

test("chargeback: deducts at once, blocks payout while open, won gives it back, closing is idempotent", async () => {
  const s = await payable("1000000000000002"); const o = await paidOrder(s.t.id, 400); await promoteAvailable();
  const cb = await openChargeback(o.id, "dp_" + suffix, 420); assert.ok(cb && cb.netAmount < 0);
  assert.equal(await openChargeback(o.id, "dp_" + suffix, 420), null, "replayed dispute event");
  assert.ok((await tenantsWithOpenDispute([s.t.id])).has(s.t.id));
  assert.ok((await previewBatch(later, 1)).skipped.some((k) => k.tenantId === s.t.id && k.reason === "dispute"));
  assert.ok(await closeChargeback("dp_" + suffix, true)); assert.equal(await closeChargeback("dp_" + suffix, true), null);
  assert.equal((await tenantsWithOpenDispute([s.t.id])).has(s.t.id), false);
  const rows = await db.select().from(schema.orderSettlements).where(eq(schema.orderSettlements.orderId, o.id));
  assert.equal(Math.round(rows.reduce((a, r) => a + r.netAmount, 0) * 100) / 100, (await sale(o.id))!.netAmount, "won: back to the original net");
});

test("batch state machine: draft -> approved -> paid; cancel releases a draft; paid is immutable", async () => {
  const s = await payable("1000000000000003"); const o = await paidOrder(s.t.id, 500); await promoteAvailable();
  const made = await createBatch(s.ownerId, later, 1, [s.t.id]);
  assert.ok(made.ok); if (!made.ok) return;
  assert.match(made.number, /^PB-\d{6}-\d{4}$/);
  assert.equal((await sale(o.id))!.status, "batched");
  const item = (await db.query.payoutItems.findFirst({ where: eq(schema.payoutItems.batchId, made.batchId) }))!;
  assert.equal(item.amount, (await sale(o.id))!.netAmount); assert.equal(item.bankSnapshot.ibanLast4.length, 4);
  // cancel draft -> available again
  assert.ok((await cancelBatch(made.batchId)).ok); assert.equal((await sale(o.id))!.status, "available");
  assert.equal((await cancelBatch(made.batchId)).ok, false, "cancel only works on a draft");
  // new batch -> approve -> paid
  const b2 = await createBatch(s.ownerId, later, 1, [s.t.id]); assert.ok(b2.ok); if (!b2.ok) return;
  assert.equal((await markBatchPaid(b2.batchId, s.ownerId, "REF-1")).ok, false, "must be approved first");
  assert.ok((await approveBatch(b2.batchId, "00000000-0000-0000-0000-000000000009", { passwordConfirmed: false, admins: 2 })).ok);
  assert.equal((await markBatchPaid(b2.batchId, s.ownerId, "")).ok, false, "bank reference required");
  assert.ok((await markBatchPaid(b2.batchId, s.ownerId, "REF-1")).ok);
  assert.equal((await sale(o.id))!.status, "paid");
  assert.equal((await db.query.payoutItems.findFirst({ where: eq(schema.payoutItems.batchId, b2.batchId) }))!.status, "paid");
  assert.equal((await cancelBatch(b2.batchId)).ok, false); assert.equal((await markBatchPaid(b2.batchId, s.ownerId, "REF-2")).ok, false);
  assert.equal((await approveBatch(b2.batchId, "00000000-0000-0000-0000-000000000009", { passwordConfirmed: false, admins: 2 })).ok, false);
  assert.equal((await createBatch(s.ownerId, later, 1, [s.t.id])).ok, false, "nothing left to pay");
});

test("batch numbers are unique even when created at the same moment", async () => {
  const shops = [await payable("1000000000000004"), await payable("1000000000000005")];
  for (const s of shops) await paidOrder(s.t.id, 100);
  await promoteAvailable();
  const rs = await Promise.all(shops.map((s) => createBatch(s.ownerId, later, 1, [s.t.id])));
  assert.ok(rs.every((r) => r.ok)); const nums = rs.map((r) => (r.ok ? r.number : ""));
  assert.notEqual(nums[0], nums[1]);
  for (const r of rs) if (r.ok) await cancelBatch(r.batchId);
});

test("maker-checker: with 2+ superadmins the creator cannot approve; with one, the password must be re-entered", async () => {
  const s = await payable("1000000000000006"); await paidOrder(s.t.id, 100); await promoteAvailable();
  const [a, b] = await Promise.all(["a", "b"].map(async (k) => (await db.insert(schema.users).values({ role: "superadmin", email: `sa${k}${suffix}@t.ae`, passwordHash: await bcrypt.hash("x", 4), name: k }).returning())[0]));
  extraUsers.push(a.id, b.id);
  const made = await createBatch(a.id, later, 1, [s.t.id]); assert.ok(made.ok); if (!made.ok) return;
  const self = await approveBatch(made.batchId, a.id, { passwordConfirmed: true, admins: 2 });
  assert.equal(self.ok, false); assert.match(self.ok ? "" : self.error, /second superadmin|maker-checker/i);
  assert.equal((await db.query.payoutBatches.findFirst({ where: eq(schema.payoutBatches.id, made.batchId) }))!.status, "draft");
  const solo = await approveBatch(made.batchId, a.id, { passwordConfirmed: false, admins: 1 });
  assert.equal(solo.ok, false); assert.match(solo.ok ? "" : solo.error, /password/i);
  assert.ok((await approveBatch(made.batchId, b.id, { passwordConfirmed: false, admins: 2 })).ok, "a different superadmin approves");
  await markBatchPaid(made.batchId, b.id, "MC-1");
});

test("IBAN unique guard: one bank account cannot serve two shops (friendly error); a rejected account frees it", async () => {
  const a = await shop(), b = await shop(); const ib = iban("2000000000000001");
  assert.ok((await savePayoutAccount(a.t.id, a.ownerId, { holderName: "A LLC", bankName: "Mashreq Bank", iban: ib })).ok);
  const dup = await savePayoutAccount(b.t.id, b.ownerId, { holderName: "B LLC", bankName: "Mashreq Bank", iban: ib.replace(/(.{4})/g, "$1 ") });
  assert.equal(dup.ok, false); assert.match(dup.ok ? "" : dup.error, /already registered to another shop/);
  const acc = (await db.query.payoutAccounts.findFirst({ where: eq(schema.payoutAccounts.tenantId, a.t.id) }))!;
  assert.equal(acc.ibanHash, ibanHash(ib)); assert.notEqual(acc.ibanEnc, ib); assert.equal(acc.ibanLast4, ib.slice(-4));
  await reviewPayoutAccount(acc.id, a.ownerId, "rejected", "wrong holder");
  assert.ok((await savePayoutAccount(b.t.id, b.ownerId, { holderName: "B LLC", bankName: "Mashreq Bank", iban: ib })).ok);
  assert.equal((await savePayoutAccount(a.t.id, a.ownerId, { holderName: "A LLC", bankName: "Mashreq Bank", iban: "AE000000000000000000000" })).ok, false, "invalid IBAN refused");
});

test("48 h hold: saving or changing bank details pauses payouts and resets approval; unchanged re-save does nothing", async () => {
  const s = await payable("3000000000000001"); await paidOrder(s.t.id, 300); await promoteAvailable();
  assert.ok((await previewBatch(later, 1)).lines.some((l) => l.tenantId === s.t.id), "payable before the change");
  const ch = await savePayoutAccount(s.t.id, s.ownerId, { holderName: "Shop LLC", bankName: "Emirates NBD", iban: iban("3000000000000009") });
  assert.ok(ch.ok && ch.changed);
  const t = (await db.query.tenants.findFirst({ where: eq(schema.tenants.id, s.t.id) }))!;
  const hours = (t.payoutHoldUntil!.getTime() - Date.now()) / 3600_000; assert.ok(hours > 47.9 && hours <= 48.01);
  const acc = (await db.query.payoutAccounts.findFirst({ where: eq(schema.payoutAccounts.tenantId, s.t.id) }))!;
  assert.equal(acc.status, "pending_review"); assert.equal(acc.history.at(-1)!.action, "changed");
  const p1 = await previewBatch(later, 1);
  assert.equal(p1.lines.some((l) => l.tenantId === s.t.id), false);
  assert.equal(p1.skipped.find((k) => k.tenantId === s.t.id)?.reason, "account_not_verified");
  await reviewPayoutAccount(acc.id, s.ownerId, "verified");
  assert.equal((await previewBatch(later, 1)).skipped.find((k) => k.tenantId === s.t.id)?.reason, "bank_details_changed", "approved but still inside the 48 h hold");
  assert.ok((await previewBatch(new Date(Date.now() + 49 * 3600_000), 1)).lines.some((l) => l.tenantId === s.t.id), "paid out after 48 h");
  const same = await savePayoutAccount(s.t.id, s.ownerId, { holderName: "Shop LLC", bankName: "Emirates NBD", iban: iban("3000000000000009") });
  assert.ok(same.ok && !same.changed);
  assert.equal((await db.query.payoutAccounts.findFirst({ where: eq(schema.payoutAccounts.tenantId, s.t.id) }))!.status, "verified");
});

test("payouts need a verified seller", async () => {
  const s = await payable("3000000000000002", { verified: false }); await paidOrder(s.t.id, 300); await promoteAvailable();
  assert.equal((await previewBatch(later, 1)).skipped.find((k) => k.tenantId === s.t.id)?.reason, "not_verified");
});

test("bank transfer CSV decrypts IBANs, and refuses when bank details changed after the batch was made", async () => {
  const s = await payable("3000000000000003"); await paidOrder(s.t.id, 200); await promoteAvailable();
  const made = await createBatch(s.ownerId, later, 1, [s.t.id]); assert.ok(made.ok); if (!made.ok) return;
  const csv = await batchCsv(made.batchId); assert.ok(csv.ok); if (csv.ok) { assert.match(csv.csv, new RegExp(iban("3000000000000003"))); assert.match(csv.csv, /Shop LLC/); }
  await savePayoutAccount(s.t.id, s.ownerId, { holderName: "Shop LLC", bankName: "Emirates NBD", iban: iban("3000000000000004") });
  assert.equal((await batchCsv(made.batchId)).ok, false);
  assert.equal((await approveBatch(made.batchId, "00000000-0000-0000-0000-000000000001", { passwordConfirmed: false, admins: 2 })).ok, false, "approval re-checks the bank details");
  await cancelBatch(made.batchId);
});

test("tenant isolation: statements and balances only ever contain the shop's own rows", async () => {
  const a = await shop(), b = await shop();
  const oa = await paidOrder(a.t.id, 100), ob = await paidOrder(b.t.id, 700);
  const sa = await shopStatement(a.t.id), sb = await shopStatement(b.t.id);
  assert.deepEqual(sa.lines.map((l) => l.orderId), [oa.id]); assert.deepEqual(sb.lines.map((l) => l.orderId), [ob.id]);
  assert.equal((await balances(a.t.id)).has(b.t.id), false);
  assert.ok(sa.balance.available + sa.balance.pending > 0 && sa.balance.pending + sa.balance.available < sb.balance.pending + sb.balance.available);
});
