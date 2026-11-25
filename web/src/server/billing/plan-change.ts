import "server-only";
import { and, eq, isNotNull, lte } from "drizzle-orm";
import { db, schema } from "@/db";

export class PlanChangeError extends Error {}

/**
 * Owner picks a plan (subscription or pay-per-order). Trial shops switch at once;
 * paying shops switch at the start of the next billing period so the current period is invoiced under the old terms.
 */
export async function requestPlanChange(tenantId: string, planId: string, now = new Date()): Promise<"applied" | "scheduled" | "unchanged"> {
  const [tenant, plan] = await Promise.all([
    db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId) }),
    db.query.plans.findFirst({ where: eq(schema.plans.id, planId) }),
  ]);
  if (!tenant || !plan || !plan.active) throw new PlanChangeError("Plan not found");
  if (tenant.planId === plan.id) {
    await clearPendingPlanChange(tenantId);
    return "unchanged";
  }
  if (tenant.status === "trial") {
    await db.update(schema.tenants).set({ planId: plan.id, pendingPlanId: null, pendingPlanAt: null }).where(eq(schema.tenants.id, tenantId));
    return "applied";
  }
  const at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  await db.update(schema.tenants).set({ pendingPlanId: plan.id, pendingPlanAt: at }).where(eq(schema.tenants.id, tenantId));
  return "scheduled";
}

export async function clearPendingPlanChange(tenantId: string) {
  await db.update(schema.tenants).set({ pendingPlanId: null, pendingPlanAt: null }).where(eq(schema.tenants.id, tenantId));
}

/** Apply every scheduled switch that is due. Run after the previous period's invoices exist. */
export async function applyPendingPlanChanges(now = new Date()): Promise<number> {
  const due = await db.query.tenants.findMany({ where: and(isNotNull(schema.tenants.pendingPlanId), lte(schema.tenants.pendingPlanAt, now)) });
  for (const t of due) {
    await db.update(schema.tenants).set({ planId: t.pendingPlanId, pendingPlanId: null, pendingPlanAt: null }).where(eq(schema.tenants.id, t.id));
  }
  return due.length;
}
