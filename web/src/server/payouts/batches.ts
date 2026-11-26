import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { bankTransferCsv, planBatch, type BatchSkip, type LedgerRow, type ShopPayoutState } from "@/lib/payouts";
import { promoteAvailable, r2, tenantsWithOpenDispute } from "./ledger";
import { revealIban } from "./account";

export const MIN_PAYOUT_AED = 50;
export const SKIP_LABELS: Record<BatchSkip["reason"], string> = {
  not_verified: "Seller not verified",
  account_not_verified: "Bank account not approved",
  bank_details_changed: "Bank details changed in the last 48 hours",
  dispute: "Open customer dispute",
  below_minimum: `Below the minimum payout (AED ${MIN_PAYOUT_AED})`,
  negative_balance: "Balance is negative (refunds carry forward)",
  nothing_available: "Nothing available yet",
};

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Who would be paid right now and who is skipped (with the reason), from real ledger data. Promotes pending -> available first. */
export async function previewBatch(now = new Date(), minPayout = MIN_PAYOUT_AED) {
  await promoteAvailable(now);
  const rows = await db.select({ id: schema.orderSettlements.id, tenantId: schema.orderSettlements.tenantId, net: schema.orderSettlements.netAmount, status: schema.orderSettlements.status, availableAt: schema.orderSettlements.availableAt })
    .from(schema.orderSettlements).where(eq(schema.orderSettlements.status, "available"));
  const tenantIds = [...new Set(rows.map((r) => r.tenantId))];
  if (!tenantIds.length) return { lines: [], skipped: [], rows: [] as LedgerRow[], tenants: new Map<string, typeof schema.tenants.$inferSelect>(), accounts: new Map<string, typeof schema.payoutAccounts.$inferSelect>() };
  const [tenants, accounts, disputes] = await Promise.all([
    db.query.tenants.findMany({ where: inArray(schema.tenants.id, tenantIds) }),
    db.query.payoutAccounts.findMany({ where: inArray(schema.payoutAccounts.tenantId, tenantIds) }),
    tenantsWithOpenDispute(tenantIds),
  ]);
  const accMap = new Map(accounts.map((a) => [a.tenantId, a]));
  const states: ShopPayoutState[] = tenants.map((t) => ({
    tenantId: t.id, verified: t.verificationStatus === "verified", accountVerified: accMap.get(t.id)?.status === "verified",
    payoutHoldUntil: t.payoutHoldUntil, openDispute: disputes.has(t.id),
  }));
  const ledger: LedgerRow[] = rows.map((r) => ({ id: r.id, tenantId: r.tenantId, net: Number(r.net), status: "available", availableAt: r.availableAt }));
  const plan = planBatch(ledger, states, { now, minPayout });
  return { ...plan, rows: ledger, tenants: new Map(tenants.map((t) => [t.id, t])), accounts: accMap };
}

/** PB-YYYYMM-0001. Serialised with an advisory lock so two superadmins creating at once never collide. */
async function nextNumber(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], now: Date) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('payout_batch_number'))`);
  const prefix = `PB-${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}-`;
  const last = await tx.execute(sql`select number from payout_batches where number like ${prefix + "%"} order by number desc limit 1`);
  const n = Number((last as unknown as { number: string }[])[0]?.number.slice(prefix.length) ?? 0) + 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}

/** Create a draft batch from everything payable now. Settlements move available -> batched (claimed atomically). */
export async function createBatch(actorId: string, now = new Date(), minPayout = MIN_PAYOUT_AED, onlyTenants?: string[]): Promise<Result<{ batchId: string; number: string; itemCount: number; total: number }>> {
  const plan = await previewBatch(now, minPayout);
  if (onlyTenants) plan.lines = plan.lines.filter((l) => onlyTenants.includes(l.tenantId));
  if (!plan.lines.length) return { ok: false, error: "Nobody is payable right now. See the skipped list for the reasons." };
  try {
    return await db.transaction(async (tx) => {
      const number = await nextNumber(tx, now);
      const total = r2(plan.lines.reduce((a, l) => a + l.amount, 0));
      const [batch] = await tx.insert(schema.payoutBatches).values({ number, status: "draft", totalAmount: total, itemCount: plan.lines.length, createdBy: actorId }).returning();
      for (const l of plan.lines) {
        const acc = plan.accounts.get(l.tenantId)!;
        const [item] = await tx.insert(schema.payoutItems).values({
          batchId: batch.id, tenantId: l.tenantId, amount: l.amount, carriedForward: l.carriedForward, settlementIds: l.settlementIds,
          bankSnapshot: { accountHolderName: acc.accountHolderName, bankName: acc.bankName, ibanLast4: acc.ibanLast4, ibanHash: acc.ibanHash },
        }).returning();
        const claimed = await tx.update(schema.orderSettlements).set({ status: "batched", payoutItemId: item.id, updatedAt: now })
          .where(and(inArray(schema.orderSettlements.id, l.settlementIds), eq(schema.orderSettlements.status, "available"))).returning({ id: schema.orderSettlements.id });
        if (claimed.length !== l.settlementIds.length) throw new Error("RACE");
      }
      return { ok: true as const, batchId: batch.id, number, itemCount: plan.lines.length, total };
    });
  } catch (e) {
    if ((e as Error).message === "RACE") return { ok: false, error: "The ledger changed while the batch was being created. Try again." };
    throw e;
  }
}

export async function superadminCount() {
  const r = await db.execute(sql`select count(*)::int as n from users where role = 'superadmin' and active = true`);
  return Number((r as unknown as { n: number }[])[0]?.n ?? 0);
}

/**
 * Draft -> approved. Maker-checker: with more than one superadmin the approver must differ from the creator;
 * with a single superadmin the approver must re-enter their password (`passwordConfirmed`, checked by the caller).
 * Everything is re-checked at approval time (verification, bank account, 48 h hold, disputes).
 */
export async function approveBatch(batchId: string, approverId: string, opts: { passwordConfirmed: boolean; admins?: number }, now = new Date()): Promise<Result> {
  const batch = await db.query.payoutBatches.findFirst({ where: eq(schema.payoutBatches.id, batchId) });
  if (!batch) return { ok: false, error: "Batch not found" };
  if (batch.status !== "draft") return { ok: false, error: `This batch is already ${batch.status}` };
  const admins = opts.admins ?? (await superadminCount());
  if (admins > 1 && batch.createdBy === approverId) return { ok: false, error: "A second superadmin must approve this batch: the person who created it cannot approve it (maker-checker)." };
  if (admins <= 1 && !opts.passwordConfirmed) return { ok: false, error: "Re-enter your password to approve this batch." };
  const items = await db.query.payoutItems.findMany({ where: eq(schema.payoutItems.batchId, batchId) });
  const tenantIds = items.map((i) => i.tenantId);
  const [tenants, accounts, disputes] = await Promise.all([
    db.query.tenants.findMany({ where: inArray(schema.tenants.id, tenantIds) }),
    db.query.payoutAccounts.findMany({ where: inArray(schema.payoutAccounts.tenantId, tenantIds) }),
    tenantsWithOpenDispute(tenantIds),
  ]);
  const problems: string[] = [];
  for (const i of items) {
    const t = tenants.find((x) => x.id === i.tenantId), a = accounts.find((x) => x.tenantId === i.tenantId);
    if (!t || t.verificationStatus !== "verified") problems.push(`${t?.name ?? i.tenantId}: seller no longer verified`);
    else if (!a || a.status !== "verified") problems.push(`${t.name}: bank account not approved`);
    else if (a.ibanHash !== i.bankSnapshot.ibanHash) problems.push(`${t.name}: bank details changed after the batch was created`);
    else if (t.payoutHoldUntil && t.payoutHoldUntil > now) problems.push(`${t.name}: bank details changed in the last 48 hours`);
    else if (disputes.has(t.id)) problems.push(`${t.name}: open customer dispute`);
  }
  if (problems.length) return { ok: false, error: `Cannot approve: ${problems.join("; ")}. Cancel this draft and create a new one.` };
  const [upd] = await db.update(schema.payoutBatches).set({ status: "approved", approvedBy: approverId, approvedAt: now })
    .where(and(eq(schema.payoutBatches.id, batchId), eq(schema.payoutBatches.status, "draft"))).returning();
  return upd ? { ok: true } : { ok: false, error: "The batch changed. Reload and try again." };
}

/** Approved -> paid once the bank transfer was made. Items and settlements become paid and immutable. */
export async function markBatchPaid(batchId: string, actorId: string, bankReference: string, now = new Date()): Promise<Result> {
  const ref = bankReference.trim();
  if (ref.length < 3 || ref.length > 80) return { ok: false, error: "Enter the bank transfer reference (3 to 80 characters)" };
  return db.transaction(async (tx) => {
    const [b] = await tx.update(schema.payoutBatches).set({ status: "paid", bankReference: ref, paidBy: actorId, paidAt: now })
      .where(and(eq(schema.payoutBatches.id, batchId), eq(schema.payoutBatches.status, "approved"))).returning();
    if (!b) return { ok: false as const, error: "Only an approved batch can be marked paid" };
    const items = await tx.update(schema.payoutItems).set({ status: "paid" }).where(eq(schema.payoutItems.batchId, batchId)).returning();
    const ids = items.flatMap((i) => i.settlementIds);
    if (ids.length) await tx.update(schema.orderSettlements).set({ status: "paid", updatedAt: now }).where(and(inArray(schema.orderSettlements.id, ids), eq(schema.orderSettlements.status, "batched")));
    return { ok: true as const };
  });
}

/** Draft only: releases the settlements back to 'available'. */
export async function cancelBatch(batchId: string, now = new Date()): Promise<Result> {
  return db.transaction(async (tx) => {
    const [b] = await tx.update(schema.payoutBatches).set({ status: "cancelled" }).where(and(eq(schema.payoutBatches.id, batchId), eq(schema.payoutBatches.status, "draft"))).returning();
    if (!b) return { ok: false as const, error: "Only a draft batch can be cancelled" };
    const items = await tx.update(schema.payoutItems).set({ status: "cancelled" }).where(eq(schema.payoutItems.batchId, batchId)).returning();
    const ids = items.flatMap((i) => i.settlementIds);
    if (ids.length) await tx.update(schema.orderSettlements).set({ status: "available", payoutItemId: null, updatedAt: now }).where(and(inArray(schema.orderSettlements.id, ids), eq(schema.orderSettlements.status, "batched")));
    return { ok: true as const };
  });
}

/**
 * Bank transfer file. The only place full IBANs are decrypted in bulk: the caller MUST audit and step-up first.
 * Refuses if a shop changed its bank details after the batch was created.
 */
export async function batchCsv(batchId: string): Promise<Result<{ csv: string; number: string }>> {
  const batch = await db.query.payoutBatches.findFirst({ where: eq(schema.payoutBatches.id, batchId) });
  if (!batch) return { ok: false, error: "Batch not found" };
  if (batch.status === "cancelled") return { ok: false, error: "This batch was cancelled" };
  const items = await db.query.payoutItems.findMany({ where: eq(schema.payoutItems.batchId, batchId) });
  const tenants = await db.query.tenants.findMany({ where: inArray(schema.tenants.id, items.map((i) => i.tenantId)) });
  const accounts = await db.query.payoutAccounts.findMany({ where: inArray(schema.payoutAccounts.tenantId, items.map((i) => i.tenantId)) });
  const rows = [];
  for (const i of items) {
    const a = accounts.find((x) => x.tenantId === i.tenantId), t = tenants.find((x) => x.id === i.tenantId);
    if (!a || a.ibanHash !== i.bankSnapshot.ibanHash) return { ok: false, error: `${t?.name ?? "A shop"} changed its bank details after this batch was created. Cancel the draft and create a new batch.` };
    rows.push({ reference: `${batch.number} ${t?.slug ?? ""}`.trim(), accountName: a.accountHolderName, bankName: a.bankName, iban: revealIban(a), amount: i.amount });
  }
  return { ok: true, csv: bankTransferCsv(rows), number: batch.number };
}

export async function listBatches(limit = 50) {
  return db.query.payoutBatches.findMany({ orderBy: desc(schema.payoutBatches.createdAt), limit });
}

export async function batchDetail(batchId: string) {
  const batch = await db.query.payoutBatches.findFirst({ where: eq(schema.payoutBatches.id, batchId) });
  if (!batch) return null;
  const items = await db.query.payoutItems.findMany({ where: eq(schema.payoutItems.batchId, batchId) });
  const tenants = items.length ? await db.query.tenants.findMany({ where: inArray(schema.tenants.id, items.map((i) => i.tenantId)) }) : [];
  return { batch, items: items.map((i) => ({ ...i, tenant: tenants.find((t) => t.id === i.tenantId)!, maskedIban: `AE•• •••• •••• •••• ${i.bankSnapshot.ibanLast4}` })) };
}

/** Gateway-recorded payments vs ledger totals. */
export async function reconciliation() {
  const pay = await db.execute(sql`select provider::text as provider, coalesce(sum(amount),0)::float8 as total, count(*)::int as n from payments where status = 'succeeded' group by provider`);
  const led = await db.execute(sql`select gateway, coalesce(sum(gross) filter (where kind='sale'),0)::float8 as gross, coalesce(sum(gateway_fee) filter (where kind='sale'),0)::float8 as fees,
      coalesce(sum(commission) filter (where kind='sale'),0)::float8 as commission, coalesce(sum(net_amount),0)::float8 as net, coalesce(sum(gross) filter (where kind <> 'sale'),0)::float8 as adjustments, count(*) filter (where kind='sale')::int as n
    from order_settlements group by gateway`);
  const orphan = await db.execute(sql`select count(*)::int as n from orders o left join order_settlements s on s.order_id = o.id and s.kind='sale' where s.id is null and o.paid_at is not null`);
  const byStatus = await db.execute(sql`select status, coalesce(sum(net_amount),0)::float8 as net, count(*)::int as n from order_settlements group by status`);
  type P = { provider: string; total: number; n: number };
  type L = { gateway: string; gross: number; fees: number; commission: number; net: number; adjustments: number; n: number };
  const providers = [...new Set([...(pay as unknown as P[]).map((p) => p.provider), ...(led as unknown as L[]).map((l) => l.gateway)])];
  const rows = providers.map((p) => {
    const g = (pay as unknown as P[]).find((x) => x.provider === p), l = (led as unknown as L[]).find((x) => x.gateway === p);
    const gatewayTotal = r2(g?.total ?? 0), ledgerGross = r2(l?.gross ?? 0);
    return { provider: p, gatewayTotal, gatewayCount: g?.n ?? 0, ledgerGross, ledgerCount: l?.n ?? 0, fees: r2(l?.fees ?? 0), commission: r2(l?.commission ?? 0), net: r2(l?.net ?? 0), adjustments: r2(l?.adjustments ?? 0), diff: r2(gatewayTotal - ledgerGross) };
  });
  return { rows, ordersWithoutLedger: Number((orphan as unknown as { n: number }[])[0]?.n ?? 0), byStatus: byStatus as unknown as { status: string; net: number; n: number }[] };
}
