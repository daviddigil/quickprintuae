import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { balances, promoteAvailable, r2, type Balance } from "./ledger";

export interface StatementRow {
  id: string; orderId: string; orderNumber: string; paidAt: Date | null; kind: string; status: string;
  gross: number; gatewayFee: number; commission: number; net: number; availableAt: Date | null;
}

const csvCell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const safe = (v: string) => (/^[=+\-@]/.test(v) ? `'${v}` : v);
export function statementCsv(rows: StatementRow[]): string {
  const head = ["Order", "Type", "Paid at", "Status", "Gross (AED)", "Gateway fee (AED)", "Commission (AED)", "Net (AED)", "Available from"];
  const body = rows.map((r) => [safe(r.orderNumber), r.kind, r.paidAt?.toISOString() ?? "", r.status, r.gross.toFixed(2), r.gatewayFee.toFixed(2), r.commission.toFixed(2), r.net.toFixed(2), r.availableAt?.toISOString() ?? ""].map(csvCell).join(","));
  return [head.join(","), ...body].join("\n") + "\n";
}

/** Everything a shop sees on its statement. Strictly scoped by tenantId. */
export async function shopStatement(tenantId: string, limit = 200) {
  await promoteAvailable();
  const bal = (await balances(tenantId)).get(tenantId) ?? { pending: 0, available: 0, batched: 0, paid: 0, negative: 0 } satisfies Balance;
  const rows = await db.select({ s: schema.orderSettlements, number: schema.orders.number, paidAt: schema.orders.paidAt })
    .from(schema.orderSettlements).innerJoin(schema.orders, eq(schema.orders.id, schema.orderSettlements.orderId))
    .where(and(eq(schema.orderSettlements.tenantId, tenantId), eq(schema.orders.tenantId, tenantId)))
    .orderBy(desc(schema.orderSettlements.createdAt)).limit(limit);
  const lines: StatementRow[] = rows.map(({ s, number, paidAt }) => ({
    id: s.id, orderId: s.orderId, orderNumber: number, paidAt, kind: s.kind, status: s.status,
    gross: Number(s.gross), gatewayFee: Number(s.gatewayFee), commission: Number(s.commission), net: Number(s.netAmount), availableAt: s.availableAt,
  }));
  const items = await db.query.payoutItems.findMany({ where: eq(schema.payoutItems.tenantId, tenantId), orderBy: desc(schema.payoutItems.createdAt), limit: 50 });
  const batches = items.length ? await db.query.payoutBatches.findMany({ where: inArray(schema.payoutBatches.id, items.map((i) => i.batchId)) }) : [];
  // only shows batches that are real payouts to the shop: approved (on its way) and paid
  const history = items.map((i) => ({ item: i, batch: batches.find((b) => b.id === i.batchId)! })).filter((h) => h.batch && ["approved", "paid"].includes(h.batch.status));
  const account = await db.query.payoutAccounts.findFirst({ where: eq(schema.payoutAccounts.tenantId, tenantId) });
  const nextPayout = r2(bal.available);
  return { balance: bal, lines, history, account, nextPayout };
}
