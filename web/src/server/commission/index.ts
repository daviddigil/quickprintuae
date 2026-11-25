import "server-only";
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { commissionBasis, computeCommission, resolveRule } from "@/lib/commission";
import { PAID_STATUSES } from "@/server/billing/paid-statuses";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The commission rule that applies to a shop right now (plan terms unless the superadmin overrode them). */
export async function effectiveRuleForTenant(tenant: typeof schema.tenants.$inferSelect) {
  const plan = tenant.planId ? await db.query.plans.findFirst({ where: eq(schema.plans.id, tenant.planId) }) : null;
  return { plan, rule: resolveRule(plan, tenant.commissionOverride) };
}

/**
 * Records the commission earned on one paid order. Idempotent (one row per order).
 * During a free trial no commission is charged: the row is stored as 'waived' so the audit trail still shows what it would have been.
 */
export async function recordOrderCommission(orderId: string) {
  const existing = await db.query.orderCommissions.findFirst({ where: eq(schema.orderCommissions.orderId, orderId) });
  if (existing) return existing;
  const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) });
  if (!order || !order.paidAt) return null;
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, order.tenantId) });
  if (!tenant) return null;
  const { plan, rule } = await effectiveRuleForTenant(tenant);
  const basis = commissionBasis({ subtotal: order.subtotal, discount: order.discount, vatRate: tenant.settings?.vatRate ?? 5, pricesIncludeVat: !!tenant.settings?.pricesIncludeVat });
  const jobs = order.source === "walk_in"
    ? Number((await db.select({ n: sql<number>`count(*)::int` }).from(schema.printJobs).where(and(eq(schema.printJobs.orderId, orderId), sql`${schema.printJobs.status} <> 'cancelled'`)))[0]?.n ?? 1)
    : Number((await db.select({ n: sql<number>`count(*)::int` }).from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId)))[0]?.n ?? 1);
  const c = computeCommission(basis, Math.max(1, jobs), rule);
  const status = tenant.status === "trial" ? "waived" : c.fee <= 0 ? "waived" : "accrued";
  const [row] = await db.insert(schema.orderCommissions).values({
    tenantId: tenant.id, orderId, basis, jobs: Math.max(1, jobs), pct: rule.pct, perJobFee: rule.perJobFee, pctFee: c.pctFee, jobFee: c.jobFee, fee: c.fee,
    minApplied: c.minApplied, maxApplied: c.maxApplied, ruleSource: rule.source, planCode: plan?.code ?? null, status,
  }).onConflictDoNothing().returning();
  return row ?? (await db.query.orderCommissions.findFirst({ where: eq(schema.orderCommissions.orderId, orderId) })) ?? null;
}

/** Order refunded/cancelled after payment: the commission is reversed. If it was already invoiced it is credited on the next invoice. */
export async function reverseOrderCommission(orderId: string) {
  const rows = await db.update(schema.orderCommissions).set({ status: "refunded", updatedAt: new Date() })
    .where(and(eq(schema.orderCommissions.orderId, orderId), inArray(schema.orderCommissions.status, ["accrued", "invoiced"]))).returning();
  return rows[0] ?? null;
}

/** Legacy / safety net: paid orders in [start,end) that have no commission row yet get one (idempotent). */
export async function ensureCommissionsForPeriod(tenantId: string, start: Date, end: Date) {
  const missing = await db.execute(sql`
    select o.id from orders o left join order_commissions c on c.order_id = o.id
    where o.tenant_id = ${tenantId} and c.id is null and o.paid_at >= ${start.toISOString()}::timestamptz and o.paid_at < ${end.toISOString()}::timestamptz
      and o.status in (${sql.join([...PAID_STATUSES].map((s) => sql`${s}`), sql`, `)}) limit 2000`);
  for (const r of missing as unknown as { id: string }[]) await recordOrderCommission(r.id);
  return (missing as unknown as unknown[]).length;
}

/** What to put on a shop's invoice: earned-but-unbilled commission (+ credits for refunds of commission already billed). */
export async function commissionsToInvoice(tenantId: string, end: Date, tx: Pick<Tx, "select"> = db) {
  const accrued = await tx.select({ id: schema.orderCommissions.id, fee: schema.orderCommissions.fee }).from(schema.orderCommissions)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.orderCommissions.orderId))
    .where(and(eq(schema.orderCommissions.tenantId, tenantId), eq(schema.orderCommissions.status, "accrued"), isNull(schema.orderCommissions.invoiceId), lt(schema.orders.paidAt, end)));
  const credits = await tx.select({ id: schema.orderCommissions.id, fee: schema.orderCommissions.fee }).from(schema.orderCommissions)
    .where(and(eq(schema.orderCommissions.tenantId, tenantId), eq(schema.orderCommissions.status, "refunded"), sql`${schema.orderCommissions.invoiceId} is not null`, isNull(schema.orderCommissions.creditedInvoiceId)));
  const sumFee = (rows: { fee: number }[]) => Math.round(rows.reduce((a, r) => a + Number(r.fee), 0) * 100) / 100;
  return { accruedIds: accrued.map((r) => r.id), creditIds: credits.map((r) => r.id), accrued: sumFee(accrued), credits: sumFee(credits) };
}

/** Commission figures for a period (superadmin reports / shop statement). */
export async function commissionSummary(start: Date, end: Date, tenantId?: string) {
  const where = [sql`o.paid_at >= ${start.toISOString()}::timestamptz`, sql`o.paid_at < ${end.toISOString()}::timestamptz`];
  if (tenantId) where.push(sql`c.tenant_id = ${tenantId}`);
  const rows = await db.execute(sql`
    select c.tenant_id, t.name, t.slug, count(*)::int as orders,
      coalesce(sum(c.basis) filter (where c.status <> 'refunded'), 0)::float8 as basis,
      coalesce(sum(c.fee) filter (where c.status = 'accrued'), 0)::float8 as accrued,
      coalesce(sum(c.fee) filter (where c.status = 'invoiced'), 0)::float8 as invoiced,
      coalesce(sum(c.fee) filter (where c.status = 'refunded'), 0)::float8 as refunded,
      coalesce(sum(c.fee) filter (where c.status = 'waived'), 0)::float8 as waived
    from order_commissions c join orders o on o.id = c.order_id join tenants t on t.id = c.tenant_id
    where ${sql.join(where, sql` and `)} group by c.tenant_id, t.name, t.slug order by 5 desc`);
  return rows as unknown as { tenant_id: string; name: string; slug: string; orders: number; basis: number; accrued: number; invoiced: number; refunded: number; waived: number }[];
}
