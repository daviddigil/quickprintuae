import "server-only";
import Stripe from "stripe";
import { and, count, eq, gte, inArray, lt, sql, sum } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Tenant } from "@/db/schema";
import { env } from "@/lib/env";
import type { PlanFlag } from "./flags";
import { computeSaasInvoice, invoiceNumber, periodBounds, r2 } from "./math";

export * from "./math";
export { PLAN_FLAGS, type PlanFlag } from "./flags";

import { PAID_STATUSES } from "./paid-statuses";
import { commissionsToInvoice, ensureCommissionsForPeriod } from "@/server/commission";
import { resolveRule } from "@/lib/commission";
import { usageForPeriod } from "@/server/usage";
import { applyPendingPlanChanges } from "./plan-change";
import { planInvoiceDiscount, consumeRedemption } from "@/server/offers/billing";
import { chargeWithCardOnFile, platformStripeFromGateway } from "./gateway/charge";

export function platformStripe() {
  return env.platformStripeKey ? new Stripe(env.platformStripeKey) : null;
}

/** GMV (incl. VAT, as charged to customers) of paid orders for a tenant in [start, end). */
export async function tenantGmv(tenantId: string | null, start: Date, end: Date) {
  const conds = [inArray(schema.orders.status, [...PAID_STATUSES]), gte(schema.orders.paidAt, start), lt(schema.orders.paidAt, end)];
  if (tenantId) conds.push(eq(schema.orders.tenantId, tenantId));
  const [row] = await db.select({ gmv: sum(schema.orders.total), n: count() }).from(schema.orders).where(and(...conds));
  return { gmv: r2(Number(row?.gmv ?? 0)), orders: Number(row?.n ?? 0) };
}

export async function getPlanUsage(tenantId: string) {
  const { start, end } = periodBounds(new Date());
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId) });
  const plan = tenant?.planId ? await db.query.plans.findFirst({ where: eq(schema.plans.id, tenant.planId) }) : null;
  const [o] = await db.select({ n: count() }).from(schema.orders)
    .where(and(eq(schema.orders.tenantId, tenantId), gte(schema.orders.createdAt, start), lt(schema.orders.createdAt, end)));
  const [s] = await db.select({ n: count() }).from(schema.users)
    .where(and(eq(schema.users.tenantId, tenantId), inArray(schema.users.role, ["owner", "staff"])));
  const { gmv } = await tenantGmv(tenantId, start, end);
  return {
    plan, ordersThisMonth: Number(o?.n ?? 0), staff: Number(s?.n ?? 0), gmvThisMonth: gmv,
    maxOrders: plan?.maxOrdersPerMonth ?? null, maxStaff: plan?.maxStaff ?? null,
  };
}

export class PlanLimitError extends Error {}

/** Throws PlanLimitError if the tenant can't take more orders/staff. kind defaults to "order". */
export async function assertWithinPlanLimits(tenant: Tenant, kind: "order" | "staff" = "order") {
  if (tenant.status === "suspended" || tenant.status === "cancelled") throw new PlanLimitError("This store is currently unavailable");
  const u = await getPlanUsage(tenant.id);
  if (kind === "order" && u.maxOrders != null && u.ordersThisMonth >= u.maxOrders)
    throw new PlanLimitError("Monthly order limit reached for this store's plan");
  if (kind === "staff" && u.maxStaff != null && u.staff >= u.maxStaff)
    throw new PlanLimitError(`Your plan allows ${u.maxStaff} team members. Upgrade to add more.`);
}

export class FeatureLockedError extends PlanLimitError {}

export async function hasFeature(tenant: Tenant, flag: PlanFlag) {
  if (!tenant.planId) return false;
  const plan = await db.query.plans.findFirst({ where: eq(schema.plans.id, tenant.planId) });
  return !!plan?.flags?.includes(flag);
}
/** Throws FeatureLockedError when the tenant's plan doesn't include `flag` (superadmin sets flags per plan). */
export async function assertFeature(tenant: Tenant, flag: PlanFlag) {
  if (!(await hasFeature(tenant, flag))) throw new FeatureLockedError("This feature isn't included in your current plan. Upgrade to enable it.");
}

/** Idempotent per tenant + period. Bills the period containing `date` (normally run on the 1st for the previous month). */
export async function generateInvoicesForPeriod(date: Date, opts: { tenantId?: string } = {}) {
  const { start, end } = periodBounds(date);
  const statusOk = inArray(schema.tenants.status, ["active", "past_due"]);
  const tenants = await db.query.tenants.findMany({ where: opts.tenantId ? and(statusOk, eq(schema.tenants.id, opts.tenantId)) : statusOk });
  const plans = await db.query.plans.findMany();
  const created: string[] = [];
  for (const t of tenants) {
    const plan = plans.find((p) => p.id === t.planId);
    if (!plan) continue;
    const existing = await db.query.saasInvoices.findFirst({
      where: and(eq(schema.saasInvoices.tenantId, t.id), eq(schema.saasInvoices.periodStart, start)),
    });
    if (existing) continue;
    const { gmv } = await tenantGmv(t.id, start, end);
    const anchor = t.trialEndsAt ?? t.createdAt;
    // commission comes from the per-order ledger (each paid order was priced with the rule in force when it was paid)
    await ensureCommissionsForPeriod(t.id, start, end);
    const led = await commissionsToInvoice(t.id, end);
    const rule = resolveRule(plan, t.commissionOverride);
    const usage = await usageForPeriod(t.id, start, end, plan.includedUsage ?? {});
    const base = {
      usageAmount: usage.total,
      priceMonthly: plan.priceMonthly, priceYearly: plan.priceYearly, billingCycle: t.billingCycle,
      orderFeePct: plan.orderFeePct, gmv, orderFeeAmount: r2(led.accrued - led.credits), subscriptionWaived: rule.subscriptionWaived,
      isYearlyBillingMonth: anchor.getUTCMonth() === start.getUTCMonth(),
    };
    // seasonal offer: discount on the subscription line only, applied before VAT
    const disc = await planInvoiceDiscount(t.id, computeSaasInvoice(base).subscription, t.billingCycle);
    const m = computeSaasInvoice({ ...base, discountAmount: disc?.amount });
    if (m.subscription + m.orderFee + m.usage <= 0) continue;
    const free = m.total <= 0; // fully discounted: nothing to charge, recorded as paid
    const [{ n }] = await db.select({ n: count() }).from(schema.saasInvoices).where(eq(schema.saasInvoices.periodStart, start));
    const inv = await db.transaction(async (tx) => {
      const [row] = await tx.insert(schema.saasInvoices).values({
        tenantId: t.id, number: invoiceNumber(start, Number(n) + 1), periodStart: start, periodEnd: end,
        subscriptionAmount: m.subscription, orderFeeAmount: m.orderFee, usageAmount: m.usage, usageDetail: usage.lines, gmv, vat: m.vat, total: m.total,
        discountAmount: m.discount, discountDetail: disc ? [disc.detail] : [],
        status: free ? "paid" : "open", ...(free ? { paidAt: new Date() } : {}),
      }).returning();
      if (disc) await consumeRedemption(tx, disc);
      if (led.accruedIds.length) await tx.update(schema.orderCommissions).set({ status: "invoiced", invoiceId: row.id, updatedAt: new Date() }).where(inArray(schema.orderCommissions.id, led.accruedIds));
      if (led.creditIds.length) await tx.update(schema.orderCommissions).set({ creditedInvoiceId: row.id, updatedAt: new Date() }).where(inArray(schema.orderCommissions.id, led.creditIds));
      return row;
    });
    created.push(inv.id);
  }
  return created;
}

/** Charge the saved card off-session, else create a hosted Stripe Checkout link. */
export async function collectInvoice(invoiceId: string): Promise<{ status: "paid" | "link" | "skipped" | "failed"; url?: string; error?: string }> {
  const inv = await db.query.saasInvoices.findFirst({ where: eq(schema.saasInvoices.id, invoiceId) });
  if (!inv || inv.status !== "open") return { status: "skipped" };
  if (inv.total <= 0) { await markInvoicePaid(inv.id); return { status: "paid" }; } // fully discounted: never charge
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, inv.tenantId) });
  if (!tenant) return { status: "skipped" };
  // card on file (SubscriptionGateway): charged automatically, e.g. the first invoice when the trial ends
  const card = await chargeWithCardOnFile(inv, tenant);
  if (card.status === "paid") { await markInvoicePaid(inv.id, card.ref); return { status: "paid" }; }
  const stripe = (await platformStripeFromGateway()) ?? platformStripe();
  if (!stripe) return { status: "skipped", error: card.status === "failed" ? card.reason : "No payment gateway configured" };
  const amount = Math.round(inv.total * 100);
  try {
    if (tenant.stripeCustomerId) {
      const cust = await stripe.customers.retrieve(tenant.stripeCustomerId);
      const pm = !cust.deleted ? cust.invoice_settings?.default_payment_method : null;
      if (pm) {
        const pi = await stripe.paymentIntents.create({
          amount, currency: "aed", customer: tenant.stripeCustomerId, payment_method: typeof pm === "string" ? pm : pm.id,
          off_session: true, confirm: true, description: `QuickPrint ${inv.number}`, metadata: { saasInvoiceId: inv.id },
        });
        if (pi.status === "succeeded") { await markInvoicePaid(inv.id, pi.id); return { status: "paid" }; }
      }
    }
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: tenant.stripeCustomerId ?? undefined,
      customer_email: tenant.stripeCustomerId ? undefined : tenant.email ?? undefined,
      line_items: [{ quantity: 1, price_data: { currency: "aed", unit_amount: amount, product_data: { name: `QuickPrint subscription ${inv.number}` } } }],
      payment_intent_data: { setup_future_usage: "off_session", metadata: { saasInvoiceId: inv.id } },
      metadata: { saasInvoiceId: inv.id, tenantId: tenant.id },
      success_url: `${env.appUrl}/admin?billing=success`,
      cancel_url: `${env.appUrl}/admin?billing=cancelled`,
    });
    await db.update(schema.saasInvoices).set({ stripeRef: session.id }).where(eq(schema.saasInvoices.id, inv.id));
    return { status: "link", url: session.url ?? undefined };
  } catch (e) {
    return { status: "failed", error: (e as Error).message };
  }
}

export async function markInvoicePaid(invoiceId: string, ref?: string) {
  const [inv] = await db.update(schema.saasInvoices)
    .set({ status: "paid", paidAt: new Date(), ...(ref ? { stripeRef: ref } : {}) })
    .where(eq(schema.saasInvoices.id, invoiceId)).returning();
  if (!inv) return;
  // reactivate if nothing else is overdue
  const [open] = await db.select({ n: count() }).from(schema.saasInvoices)
    .where(and(eq(schema.saasInvoices.tenantId, inv.tenantId), eq(schema.saasInvoices.status, "open"), lt(schema.saasInvoices.createdAt, new Date(Date.now() - 7 * 86400_000))));
  if (Number(open.n) === 0)
    await db.update(schema.tenants).set({ status: "active" }).where(and(eq(schema.tenants.id, inv.tenantId), inArray(schema.tenants.status, ["past_due", "suspended", "trial"])));
}

/** past_due after 7 days unpaid, suspended after 21; expired trials -> past_due unless card on file. */
export async function enforceDunning(now = new Date()) {
  const d7 = new Date(now.getTime() - 7 * 86400_000);
  const d21 = new Date(now.getTime() - 21 * 86400_000);
  const overdue = await db.query.saasInvoices.findMany({ where: and(eq(schema.saasInvoices.status, "open"), lt(schema.saasInvoices.createdAt, d7)) });
  let pastDue = 0, suspended = 0, trialsEnded = 0;
  for (const inv of overdue) {
    const status = inv.createdAt < d21 ? "suspended" : "past_due";
    const r = await db.update(schema.tenants).set({ status })
      .where(and(eq(schema.tenants.id, inv.tenantId), inArray(schema.tenants.status, status === "suspended" ? ["active", "past_due"] : ["active"]))).returning();
    if (r.length) { if (status === "suspended") suspended++; else pastDue++; }
  }
  const expired = await db.query.tenants.findMany({ where: and(eq(schema.tenants.status, "trial"), lt(schema.tenants.trialEndsAt, now)) });
  for (const t of expired) {
    let hasCard = t.cardStatus === "on_file";
    const stripe = platformStripe();
    if (stripe && t.stripeCustomerId) {
      try {
        const c = await stripe.customers.retrieve(t.stripeCustomerId);
        hasCard = hasCard || (!c.deleted && !!c.invoice_settings?.default_payment_method);
      } catch { /* treat as no card */ }
    }
    await db.update(schema.tenants).set({ status: hasCard ? "active" : "past_due" }).where(eq(schema.tenants.id, t.id));
    // trial over and a card on file: bill the first invoice now and charge it (a failed charge stays open and goes through the dunning below)
    if (hasCard) for (const invoiceId of await generateInvoicesForPeriod(t.trialEndsAt ?? now, { tenantId: t.id })) await collectInvoice(invoiceId);
    trialsEnded++;
  }
  return { pastDue, suspended, trialsEnded };
}

/** Full cron run: bill previous month, try to collect open invoices, dunning. */
export async function runBillingCron(now = new Date()) {
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));
  const created = await generateInvoicesForPeriod(prev);
  // plan-model switches requested by owners start with the new period, after the old period is invoiced
  const switched = await applyPendingPlanChanges(now);
  const open = await db.query.saasInvoices.findMany({ where: eq(schema.saasInvoices.status, "open") });
  const collected: Record<string, string> = {};
  for (const inv of open) collected[inv.number] = (await collectInvoice(inv.id)).status;
  const dunning = await enforceDunning(now);
  return { created: created.length, collected, dunning, switched };
}

/** Platform KPIs for the superadmin dashboard. */
export async function platformMetrics() {
  const { start, end } = periodBounds(new Date());
  const tenants = await db.query.tenants.findMany();
  const plans = await db.query.plans.findMany();
  let mrr = 0, feesThisMonth = 0;
  const byStatus: Record<string, number> = {};
  const { gmv, orders } = await tenantGmv(null, start, end);
  for (const t of tenants) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    const plan = plans.find((p) => p.id === t.planId);
    if (!plan) continue;
    if (t.status === "active" || t.status === "past_due") mrr += t.billingCycle === "yearly" ? plan.priceYearly / 12 : plan.priceMonthly;
  }
  // commission earned this month from the per-order ledger (missing rows for legacy orders are filled in first)
  for (const t of tenants) await ensureCommissionsForPeriod(t.id, start, end);
  const feeRows = await db.execute(sql`select coalesce(sum(c.fee), 0)::float8 as fee from order_commissions c join orders o on o.id = c.order_id
    where c.status in ('accrued', 'invoiced', 'settled') and o.paid_at >= ${start.toISOString()}::timestamptz and o.paid_at < ${end.toISOString()}::timestamptz`);
  feesThisMonth = Number((feeRows as unknown as { fee: number }[])[0]?.fee ?? 0);
  const since = new Date(Date.now() - 12 * 7 * 86400_000);
  const signups = await db.select({ week: sql<string>`to_char(date_trunc('week', ${schema.tenants.createdAt}), 'YYYY-MM-DD')`, n: count() })
    .from(schema.tenants).where(gte(schema.tenants.createdAt, since))
    .groupBy(sql`date_trunc('week', ${schema.tenants.createdAt})`).orderBy(sql`date_trunc('week', ${schema.tenants.createdAt})`);
  const weekAhead = new Date(Date.now() + 7 * 86400_000);
  const expiringTrials = tenants.filter((t) => t.status === "trial" && t.trialEndsAt && t.trialEndsAt < weekAhead);
  return {
    mrr: r2(mrr), arr: r2(mrr * 12), gmv, orders, feesThisMonth: r2(feesThisMonth), byStatus, total: tenants.length,
    signups: signups.map((s) => ({ week: s.week, n: Number(s.n) })), expiringTrials,
    walkIn: await walkInMetrics(start, end),
  };
}

/** Platform-wide walk-in queue numbers for [start, end): one aggregate query, no per-tenant loops. */
export async function walkInMetrics(start: Date, end: Date) {
  const s = start.toISOString(), e = end.toISOString();
  const paid = sql.raw(PAID_STATUSES.map((x) => `'${x}'`).join(","));
  const rows = await db.execute(sql`
    select
      (select count(*)::int from print_jobs where queued_at >= ${s}::timestamptz and queued_at < ${e}::timestamptz) as jobs,
      (select count(*)::int from print_jobs where status = 'printed' and finished_at >= ${s}::timestamptz and finished_at < ${e}::timestamptz) as printed,
      (select coalesce(sum(total), 0)::float from orders where source = 'walk_in' and status in (${paid}) and paid_at >= ${s}::timestamptz and paid_at < ${e}::timestamptz) as gmv,
      (select count(*)::int from print_agents where active and last_seen_at > now() - interval '2 minutes') as agents_online,
      (select count(distinct tenant_id)::int from orders where source = 'walk_in' and created_at >= ${s}::timestamptz and created_at < ${e}::timestamptz) as shops`);
  const r = (rows as unknown as Record<string, number>[])[0] ?? {};
  return { jobsThisMonth: Number(r.jobs ?? 0), printedThisMonth: Number(r.printed ?? 0), walkInGmvThisMonth: r2(Number(r.gmv ?? 0)), agentsOnline: Number(r.agents_online ?? 0), shopsUsing: Number(r.shops ?? 0) };
}

/** Per-shop walk-in numbers for the superadmin tenant page. */
export async function tenantWalkInStats(tenantId: string) {
  const { start, end } = periodBounds(new Date());
  const rows = await db.execute(sql`
    select
      (select count(*)::int from print_jobs where tenant_id = ${tenantId} and queued_at >= ${start.toISOString()}::timestamptz and queued_at < ${end.toISOString()}::timestamptz) as jobs,
      (select count(*)::int from print_jobs where tenant_id = ${tenantId} and status = 'queued') as waiting,
      (select count(*)::int from print_jobs where tenant_id = ${tenantId} and status = 'printed' and finished_at >= date_trunc('day', now() at time zone 'Asia/Dubai') at time zone 'Asia/Dubai') as printed_today,
      (select count(*)::int from walk_in_customers where tenant_id = ${tenantId}) as customers`);
  const r = (rows as unknown as Record<string, number>[])[0] ?? {};
  const agents = await db.query.printAgents.findMany({ where: eq(schema.printAgents.tenantId, tenantId), orderBy: schema.printAgents.createdAt });
  return { jobsThisMonth: Number(r.jobs ?? 0), waiting: Number(r.waiting ?? 0), printedToday: Number(r.printed_today ?? 0), customers: Number(r.customers ?? 0), agents };
}
