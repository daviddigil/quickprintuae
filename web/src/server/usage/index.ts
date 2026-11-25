import "server-only";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { computeUsageCharges, USAGE_KINDS, type UsageKind } from "@/lib/usage";

/** Record metered usage. Never throws: metering must not break a customer-facing flow. `ref` makes retries idempotent. */
export async function recordUsage(tenantId: string, kind: UsageKind, o: { quantity?: number; tokensIn?: number; tokensOut?: number; billable?: boolean; ref?: string; meta?: unknown } = {}) {
  try {
    await db.insert(schema.usageEvents).values({
      tenantId, kind, quantity: o.quantity ?? 1, tokensIn: o.tokensIn, tokensOut: o.tokensOut,
      billable: o.billable ?? true, ref: o.ref, meta: o.meta as never,
    }).onConflictDoNothing();
  } catch (e) { console.error("recordUsage failed", e); }
}

export async function usageRatesMap(): Promise<Record<string, number>> {
  const rows = await db.query.usageRates.findMany();
  return Object.fromEntries(rows.filter((r) => r.active).map((r) => [r.kind, r.priceAed]));
}

export async function usageCounts(tenantId: string, start: Date, end: Date): Promise<Record<string, number>> {
  const rows = await db.select({ kind: schema.usageEvents.kind, n: sql<number>`coalesce(sum(${schema.usageEvents.quantity}),0)::int` })
    .from(schema.usageEvents)
    .where(and(eq(schema.usageEvents.tenantId, tenantId), eq(schema.usageEvents.billable, true), gte(schema.usageEvents.createdAt, start), lt(schema.usageEvents.createdAt, end)))
    .groupBy(schema.usageEvents.kind);
  return Object.fromEntries(rows.map((r) => [r.kind, Number(r.n)]));
}

export async function usageForPeriod(tenantId: string, start: Date, end: Date, allowances: Record<string, number> = {}) {
  const [counts, rates] = await Promise.all([usageCounts(tenantId, start, end), usageRatesMap()]);
  return computeUsageCharges(counts, rates, allowances);
}

export async function saveUsageRate(kind: string, priceAed: number, active = true) {
  if (!USAGE_KINDS.some((k) => k.kind === kind)) throw new Error("unknown usage kind");
  await db.insert(schema.usageRates).values({ kind, priceAed, active }).onConflictDoUpdate({ target: schema.usageRates.kind, set: { priceAed, active, updatedAt: new Date() } });
}
