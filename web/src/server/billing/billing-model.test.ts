/** DB-backed. Billing model switch + pay-as-you-go usage on invoices. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createDb } from "@/db/client";
import { provisionTenant, ensurePlans } from "@/server/provision";
import { generateInvoicesForPeriod, runBillingCron } from "@/server/billing";
import { requestPlanChange, clearPendingPlanChange, applyPendingPlanChanges } from "./plan-change";
import { recordUsage, saveUsageRate } from "@/server/usage";

const suffix = Date.now().toString(36);
const created: string[] = [];
async function shop(planCode: string, status: "trial" | "active" = "active") {
  await ensurePlans(db);
  const { tenant: t } = await provisionTenant(createDb().db, { shopName: `B ${suffix}`, slug: `b${suffix}${created.length}`, ownerName: "O", ownerEmail: `b${created.length}${suffix}@t.ae`, ownerPassword: "pw123456", planCode });
  created.push(t.id);
  await db.update(schema.tenants).set({ status }).where(eq(schema.tenants.id, t.id));
  return t.id;
}
const plan = (code: string) => db.query.plans.findFirst({ where: eq(schema.plans.code, code) }).then((p) => p!);
const tenant = (id: string) => db.query.tenants.findFirst({ where: eq(schema.tenants.id, id) }).then((t) => t!);
after(async () => { for (const id of created) await db.delete(schema.tenants).where(eq(schema.tenants.id, id)); });

test("trial shops switch plan model immediately", async () => {
  const id = await shop("growth", "trial");
  assert.equal(await requestPlanChange(id, (await plan("payg")).id), "applied");
  assert.equal((await tenant(id)).planId, (await plan("payg")).id);
});

test("paying shops switch at next month; cancel works; cron applies it", async () => {
  const id = await shop("growth");
  const payg = await plan("payg");
  assert.equal(await requestPlanChange(id, payg.id, new Date(Date.UTC(2031, 0, 10))), "scheduled");
  let t = await tenant(id);
  assert.equal(t.planId, (await plan("growth")).id, "unchanged until the period rolls");
  assert.equal(t.pendingPlanAt?.toISOString(), "2031-02-01T00:00:00.000Z");
  await clearPendingPlanChange(id);
  assert.equal((await tenant(id)).pendingPlanId, null);
  await requestPlanChange(id, payg.id, new Date(Date.UTC(2031, 0, 10)));
  assert.ok((await applyPendingPlanChanges(new Date(Date.UTC(2031, 0, 20)))) >= 0);
  assert.equal((await tenant(id)).planId, (await plan("growth")).id, "not due yet");
  await applyPendingPlanChanges(new Date(Date.UTC(2031, 1, 1)));
  t = await tenant(id);
  assert.equal(t.planId, payg.id); assert.equal(t.pendingPlanId, null);
});

test("subscription shop pays no commission; invoice = subscription + usage beyond the free allowance, plus VAT", async () => {
  await saveUsageRate("ai_chat_turn", 0.1); await saveUsageRate("whatsapp_message_out", 0);
  const id = await shop("growth");
  const g = await plan("growth");
  await db.update(schema.plans).set({ includedUsage: { ai_chat_turn: 10 } }).where(eq(schema.plans.id, g.id));
  try {
    for (let i = 0; i < 25; i++) await recordUsage(id, "ai_chat_turn", { ref: `r${i}`, tokensIn: 100, tokensOut: 50 });
    await recordUsage(id, "ai_chat_turn", { ref: "r0" }); // retry: idempotent
    await recordUsage(id, "ai_chat_turn", { ref: "t1", billable: false }); // owner test chat
    await recordUsage(id, "whatsapp_message_out", { ref: "w1" }); // rate 0 → free
    const d = new Date();
    const [inv] = await generateInvoicesForPeriod(d, { tenantId: id });
    const row = (await db.query.saasInvoices.findFirst({ where: eq(schema.saasInvoices.id, inv) }))!;
    assert.equal(row.orderFeeAmount, 0);
    assert.equal(row.usageAmount, 1.5); // (25-10) x 0.10
    assert.equal(row.subscriptionAmount, g.priceMonthly);
    assert.equal(row.total, Math.round((g.priceMonthly + 1.5) * 1.05 * 100) / 100);
    assert.equal(row.usageDetail.find((l) => l.kind === "ai_chat_turn")?.billedQty, 15);
  } finally { await db.update(schema.plans).set({ includedUsage: {} }).where(eq(schema.plans.id, g.id)); await saveUsageRate("ai_chat_turn", 0); }
});

test("pay-per-order shop has no subscription line on the invoice", async () => {
  await saveUsageRate("ai_banner", 2);
  const id = await shop("payg");
  await recordUsage(id, "ai_banner");
  const [inv] = await generateInvoicesForPeriod(new Date(), { tenantId: id });
  const row = (await db.query.saasInvoices.findFirst({ where: eq(schema.saasInvoices.id, inv) }))!;
  assert.equal(row.subscriptionAmount, 0); assert.equal(row.usageAmount, 2); assert.equal(row.total, 2.1);
  await saveUsageRate("ai_banner", 0);
});
void runBillingCron;
