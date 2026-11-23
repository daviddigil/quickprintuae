import "server-only";
import Stripe from "stripe";
import { and, count, eq, gte, inArray, lt, sql, sum } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Tenant } from "@/db/schema";
import { env } from "@/lib/env";
import { computeSaasInvoice, invoiceNumber, periodBounds, r2 } from "./math";

export * from "./math";

const PAID_STATUSES = ["paid", "in_production", "ready", "out_for_delivery", "delivered", "picked_up"] as const;

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
export type PlanFlag = "walk_in_queue";

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
export async function generateInvoicesForPeriod(date: Date) {
  const { start, end } = periodBounds(date);
  const tenants = await db.query.tenants.findMany({ where: inArray(schema.tenants.status, ["active", "past_due"]) });
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
    const m = computeSaasInvoice({
      priceMonthly: plan.priceMonthly, priceYearly: plan.priceYearly, billingCycle: t.billingCycle,
      orderFeePct: plan.orderFeePct, gmv, isYearlyBillingMonth: anchor.getUTCMonth() === start.getUTCMonth(),
    });
    if (m.total <= 0) continue;
    const [{ n }] = await db.select({ n: count() }).from(schema.saasInvoices).where(eq(schema.saasInvoices.periodStart, start));
    const [inv] = await db.insert(schema.saasInvoices).values({
      tenantId: t.id, number: invoiceNumber(start, Number(n) + 1), periodStart: start, periodEnd: end,
      subscriptionAmount: m.subscription, orderFeeAmount: m.orderFee, gmv, vat: m.vat, total: m.total, status: "open",
    }).returning();
    created.push(inv.id);
  }
  return created;
}

/** Charge the saved card off-session, else create a hosted Stripe Checkout link. */
export async function collectInvoice(invoiceId: string): Promise<{ status: "paid" | "link" | "skipped" | "failed"; url?: string; error?: string }> {
  const inv = await db.query.saasInvoices.findFirst({ where: eq(schema.saasInvoices.id, invoiceId) });
  if (!inv || inv.status !== "open") return { status: "skipped" };
  const stripe = platformStripe();
  if (!stripe) return { status: "skipped", error: "PLATFORM_STRIPE_SECRET_KEY not set" };
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, inv.tenantId) });
  if (!tenant) return { status: "skipped" };
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
    let hasCard = false;
    const stripe = platformStripe();
    if (stripe && t.stripeCustomerId) {
      try {
        const c = await stripe.customers.retrieve(t.stripeCustomerId);
        hasCard = !c.deleted && !!c.invoice_settings?.default_payment_method;
      } catch { /* treat as no card */ }
    }
    await db.update(schema.tenants).set({ status: hasCard ? "active" : "past_due" }).where(eq(schema.tenants.id, t.id));
    trialsEnded++;
  }
  return { pastDue, suspended, trialsEnded };
}

/** Full cron run: bill previous month, try to collect open invoices, dunning. */
export async function runBillingCron(now = new Date()) {
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));
  const created = await generateInvoicesForPeriod(prev);
  const open = await db.query.saasInvoices.findMany({ where: eq(schema.saasInvoices.status, "open") });
  const collected: Record<string, string> = {};
  for (const inv of open) collected[inv.number] = (await collectInvoice(inv.id)).status;
  const dunning = await enforceDunning(now);
  return { created: created.length, collected, dunning };
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
  const perTenant = await db.select({ tenantId: schema.orders.tenantId, gmv: sum(schema.orders.total) }).from(schema.orders)
    .where(and(inArray(schema.orders.status, [...PAID_STATUSES]), gte(schema.orders.paidAt, start), lt(schema.orders.paidAt, end)))
    .groupBy(schema.orders.tenantId);
  for (const row of perTenant) {
    const t = tenants.find((x) => x.id === row.tenantId);
    const plan = plans.find((p) => p.id === t?.planId);
    if (plan) feesThisMonth += (Number(row.gmv) * plan.orderFeePct) / 100;
  }
  const since = new Date(Date.now() - 12 * 7 * 86400_000);
  const signups = await db.select({ week: sql<string>`to_char(date_trunc('week', ${schema.tenants.createdAt}), 'YYYY-MM-DD')`, n: count() })
    .from(schema.tenants).where(gte(schema.tenants.createdAt, since))
    .groupBy(sql`date_trunc('week', ${schema.tenants.createdAt})`).orderBy(sql`date_trunc('week', ${schema.tenants.createdAt})`);
  const weekAhead = new Date(Date.now() + 7 * 86400_000);
  const expiringTrials = tenants.filter((t) => t.status === "trial" && t.trialEndsAt && t.trialEndsAt < weekAhead);
  return {
    mrr: r2(mrr), arr: r2(mrr * 12), gmv, orders, feesThisMonth: r2(feesThisMonth), byStatus, total: tenants.length,
    signups: signups.map((s) => ({ week: s.week, n: Number(s.n) })), expiringTrials,
  };
}
