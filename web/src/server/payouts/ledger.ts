import "server-only";
import { and, eq, lte, sql, TransactionRollbackError } from "drizzle-orm";
import { db, schema } from "@/db";
import { availableAt, computeNet, estimateGatewayFee } from "@/lib/payouts";
import { getPlatformGateway, type PlatformProvider } from "@/server/payments/platform";
import { recordOrderCommission } from "@/server/commission";

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface SettlementOpts { gatewayFee?: number; provider?: PlatformProvider; providerRef?: string }

/**
 * Ledger row for one paid order (kind 'sale'). Idempotent: one per order.
 * Platform payout mode: the order's commission is NETTED from the shop's payout, so the commission row is flipped
 * accrued -> settled in the SAME transaction (invoice generation only bills 'accrued' rows, so it is never charged twice).
 * Trial/waived commission is 0 in the ledger. A commission that was already invoiced is not netted again.
 */
export async function recordSettlementForOrder(orderId: string, opts: SettlementOpts = {}) {
  const existing = await db.query.orderSettlements.findFirst({ where: and(eq(schema.orderSettlements.orderId, orderId), eq(schema.orderSettlements.kind, "sale")) });
  if (existing) return existing;
  const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) });
  if (!order || !order.paidAt) return null;
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, order.tenantId) });
  if (!tenant) return null;
  const provider = (opts.provider ?? (order.paymentProvider as PlatformProvider | null) ?? "stripe") as PlatformProvider;
  const gw = await getPlatformGateway(provider);
  const comm = await recordOrderCommission(orderId).catch(() => null);

  return db.transaction(async (tx) => {
    let commission = 0;
    if (comm && tenant.payoutMode === "platform") {
      if (comm.status === "accrued") {
        const flipped = await tx.update(schema.orderCommissions).set({ status: "settled", updatedAt: new Date() })
          .where(and(eq(schema.orderCommissions.id, comm.id), eq(schema.orderCommissions.status, "accrued"), sql`${schema.orderCommissions.invoiceId} is null`)).returning();
        if (flipped.length) commission = r2(Number(comm.fee));
      } else if (comm.status === "settled") commission = r2(Number(comm.fee));
    }
    const gross = r2(order.total);
    const gatewayFee = r2(opts.gatewayFee ?? estimateGatewayFee(gross));
    const net = computeNet({ gross, gatewayFee, commission, recipientPaysFees: gw.recipientPaysFees });
    const [row] = await tx.insert(schema.orderSettlements).values({
      tenantId: tenant.id, orderId, kind: "sale", gateway: provider, gatewayPaymentId: opts.providerRef ?? null,
      gross, platformFee: commission, shopShare: net, recipientPaysFees: gw.recipientPaysFees,
      gatewayFee, commission, netAmount: net, availableAt: availableAt(order.paidAt!, gw.payoutHoldDays), status: "pending",
    }).onConflictDoNothing().returning();
    if (!row) {
      // lost a race with a concurrent call: undo our commission flip by aborting this transaction
      tx.rollback();
    }
    return row;
  }).catch(async (e) => {
    if (e instanceof TransactionRollbackError) return (await db.query.orderSettlements.findFirst({ where: and(eq(schema.orderSettlements.orderId, orderId), eq(schema.orderSettlements.kind, "sale")) })) ?? null;
    throw e;
  });
}

/** pending -> available once the hold period has passed. Returns how many rows moved. */
export async function promoteAvailable(now = new Date()): Promise<number> {
  const rows = await db.update(schema.orderSettlements).set({ status: "available", updatedAt: now })
    .where(and(eq(schema.orderSettlements.status, "pending"), lte(schema.orderSettlements.availableAt, now))).returning({ id: schema.orderSettlements.id });
  return rows.length;
}

/** Safety net for cron: paid orders with no ledger row (e.g. paid before the ledger existed or the hook failed) get one. */
export async function backfillSettlements(limit = 500): Promise<number> {
  const missing = await db.execute(sql`
    select o.id from orders o left join order_settlements s on s.order_id = o.id and s.kind = 'sale'
    where s.id is null and o.paid_at is not null and o.status in ('paid','in_production','ready','out_for_delivery','delivered','picked_up') limit ${limit}`);
  let n = 0;
  for (const r of missing as unknown as { id: string }[]) if (await recordSettlementForOrder(r.id).catch(() => null)) n++;
  return n;
}

async function reversalRow(sale: typeof schema.orderSettlements.$inferSelect, kind: string, externalRef: string, amount: number, now: Date) {
  const share = sale.gross > 0 ? amount / sale.gross : 0;
  const net = -r2(share * (sale.gross - sale.commission));
  const commission = -r2(share * sale.commission);
  const open = sale.status === "pending"; // not yet available: the adjustment waits with it so the two net out
  const [row] = await db.insert(schema.orderSettlements).values({
    tenantId: sale.tenantId, orderId: sale.orderId, kind, externalRef, gateway: sale.gateway, gatewayPaymentId: sale.gatewayPaymentId,
    gross: -r2(amount), platformFee: commission, shopShare: net, recipientPaysFees: sale.recipientPaysFees, gatewayFee: 0, commission, netAmount: net,
    availableAt: open ? sale.availableAt : now, status: open ? "pending" : "available",
  }).onConflictDoNothing().returning();
  return row ?? null;
}

/**
 * Refund (full or partial). `refundedTotal` is the CUMULATIVE amount refunded to the customer so far, so replays and
 * repeated events are idempotent: only the new part is posted, as a NEW negative row (rows are never edited).
 */
export async function applyRefund(orderId: string, refundedTotal: number, now = new Date()) {
  const sale = await db.query.orderSettlements.findFirst({ where: and(eq(schema.orderSettlements.orderId, orderId), eq(schema.orderSettlements.kind, "sale")) });
  if (!sale) return null;
  const total = Math.min(r2(refundedTotal), sale.gross);
  const delta = r2(total - sale.refundedAmount);
  if (delta <= 0) return null;
  const row = await reversalRow(sale, "refund", `refund:${orderId}:${total.toFixed(2)}`, delta, now);
  if (row) await db.update(schema.orderSettlements).set({ refundedAmount: total, updatedAt: now }).where(eq(schema.orderSettlements.id, sale.id));
  return row;
}

/** A customer dispute was opened: the amount is deducted at once and the shop cannot be paid out until it is closed. */
export async function openChargeback(orderId: string, disputeId: string, amount?: number, now = new Date()) {
  const sale = await db.query.orderSettlements.findFirst({ where: and(eq(schema.orderSettlements.orderId, orderId), eq(schema.orderSettlements.kind, "sale")) });
  if (!sale) return null;
  return reversalRow(sale, "chargeback", `dispute:${disputeId}`, Math.min(amount ?? sale.gross, sale.gross), now);
}

/** Dispute closed: won -> the deduction is given back (new positive row); lost -> a zero marker row closes it. Idempotent. */
export async function closeChargeback(disputeId: string, won: boolean, now = new Date()) {
  const opened = await db.query.orderSettlements.findFirst({ where: eq(schema.orderSettlements.externalRef, `dispute:${disputeId}`) });
  if (!opened) return null;
  const ref = `dispute:${disputeId}:closed`;
  const [row] = await db.insert(schema.orderSettlements).values({
    tenantId: opened.tenantId, orderId: opened.orderId, kind: won ? "chargeback_won" : "chargeback_lost", externalRef: ref, gateway: opened.gateway,
    gross: won ? -opened.gross : 0, platformFee: won ? -opened.commission : 0, shopShare: won ? -opened.netAmount : 0, recipientPaysFees: opened.recipientPaysFees,
    gatewayFee: 0, commission: won ? -opened.commission : 0, netAmount: won ? -opened.netAmount : 0, availableAt: now, status: won ? "available" : "refunded",
  }).onConflictDoNothing().returning();
  return row ?? null;
}

/** Tenants with a dispute that is still open (a chargeback row without its ':closed' partner). */
export async function tenantsWithOpenDispute(tenantIds?: string[]): Promise<Set<string>> {
  const rows = await db.execute(sql`
    select distinct c.tenant_id from order_settlements c
    where c.kind = 'chargeback' and not exists (select 1 from order_settlements d where d.external_ref = c.external_ref || ':closed')
    ${tenantIds?.length ? sql`and c.tenant_id in (${sql.join(tenantIds.map((t) => sql`${t}::uuid`), sql`, `)})` : sql``}`);
  return new Set((rows as unknown as { tenant_id: string }[]).map((r) => r.tenant_id));
}

export interface Balance { pending: number; available: number; batched: number; paid: number; negative: number }
const emptyBalance = (): Balance => ({ pending: 0, available: 0, batched: 0, paid: 0, negative: 0 });

/** Balances per tenant (or one). `negative` is the part of pending+available that is owed back (refunds, chargebacks). */
export async function balances(tenantId?: string): Promise<Map<string, Balance>> {
  const rows = await db.execute(sql`
    select tenant_id, status,
      coalesce(sum(net_amount), 0)::float8 as total,
      coalesce(sum(net_amount) filter (where net_amount < 0), 0)::float8 as neg
    from order_settlements ${tenantId ? sql`where tenant_id = ${tenantId}` : sql``} group by tenant_id, status`);
  const out = new Map<string, Balance>();
  for (const r of rows as unknown as { tenant_id: string; status: string; total: number; neg: number }[]) {
    const b = out.get(r.tenant_id) ?? emptyBalance();
    if (r.status === "pending") { b.pending = r2(b.pending + r.total); b.negative = r2(b.negative + r.neg); }
    else if (r.status === "available") { b.available = r2(b.available + r.total); b.negative = r2(b.negative + r.neg); }
    else if (r.status === "batched") b.batched = r2(b.batched + r.total);
    else if (r.status === "paid") b.paid = r2(b.paid + r.total);
    out.set(r.tenant_id, b);
  }
  return out;
}

