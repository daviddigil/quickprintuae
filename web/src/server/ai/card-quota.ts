import "server-only";
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Tenant } from "@/db/schema";
import { ipLimit, quotaPeriod, quotaView, type QuotaView } from "@/lib/ai-quota";

/** AI designs one customer may generate per month on the shop's plan (Starter 3, Growth 5, Enterprise 15 by default; editable per plan in the superadmin). */
export async function planDesignLimit(tenant: Pick<Tenant, "planId">): Promise<number> {
  if (!tenant.planId) return 3;
  const plan = await db.query.plans.findFirst({ where: eq(schema.plans.id, tenant.planId), columns: { aiDesignsPerCustomer: true } });
  return plan?.aiDesignsPerCustomer ?? 3;
}

export const ipSubject = (ip: string) => `ip:${createHash("sha256").update(ip).digest("hex").slice(0, 24)}`;

/**
 * Atomically reserve one design for a subject this month. The conditional upsert makes it impossible to exceed the limit
 * under parallel requests. Returns the view after the reservation, or null when the limit is already reached.
 */
export async function reserveDesign(tenantId: string, subjectKey: string, limit: number, now = new Date()): Promise<QuotaView | null> {
  const period = quotaPeriod(now);
  if (limit <= 0) return null;
  const rows = await db.execute(sql`
    insert into ai_design_quota (tenant_id, subject_key, period, used) values (${tenantId}, ${subjectKey}, ${period}, 1)
    on conflict (tenant_id, subject_key, period) do update set used = ai_design_quota.used + 1, updated_at = now()
      where ai_design_quota.used < ${limit}
    returning used`);
  const row = (rows as unknown as { used: number }[])[0];
  return row ? quotaView(Number(row.used), limit, period) : null;
}

/** Give a reservation back (the AI failed or fell back to templates, so the customer did not get an AI design). */
export async function releaseDesign(tenantId: string, subjectKey: string, now = new Date()) {
  await db.update(schema.aiDesignQuota).set({ used: sql`greatest(${schema.aiDesignQuota.used} - 1, 0)`, updatedAt: new Date() })
    .where(and(eq(schema.aiDesignQuota.tenantId, tenantId), eq(schema.aiDesignQuota.subjectKey, subjectKey), eq(schema.aiDesignQuota.period, quotaPeriod(now))));
}

export async function designQuota(tenantId: string, subjectKey: string, limit: number, now = new Date()): Promise<QuotaView> {
  const period = quotaPeriod(now);
  const row = await db.query.aiDesignQuota.findFirst({ where: and(eq(schema.aiDesignQuota.tenantId, tenantId), eq(schema.aiDesignQuota.subjectKey, subjectKey), eq(schema.aiDesignQuota.period, period)) });
  return quotaView(row?.used ?? 0, limit, period);
}



/**
 * One AI design for one customer: reserves the per-customer and per-network counters, runs `generate`,
 * and keeps the reservation only when the AI really produced the design (source === "ai"); otherwise both are released.
 * Billing (recordUsage) is done by the caller on success, so the shop pays whether or not the customer checks out.
 */
export async function withDesignQuota<T extends { source: string }>(
  tenant: Pick<Tenant, "id" | "planId">, subject: string, ip: string, generate: () => Promise<T>, now = new Date(),
): Promise<{ allowed: true; result: T; quota: QuotaView } | { allowed: false; quota: QuotaView }> {
  const limit = await planDesignLimit(tenant);
  const mine = await reserveDesign(tenant.id, subject, limit, now);
  if (!mine) return { allowed: false, quota: await designQuota(tenant.id, subject, limit, now) };
  const ipKey = ipSubject(ip);
  const net = await reserveDesign(tenant.id, ipKey, ipLimit(limit), now);
  if (!net) { await releaseDesign(tenant.id, subject, now); return { allowed: false, quota: quotaView(limit, limit, mine.period) }; }
  try {
    const result = await generate();
    if (result.source !== "ai") { await releaseDesign(tenant.id, subject, now); await releaseDesign(tenant.id, ipKey, now); return { allowed: true, result, quota: await designQuota(tenant.id, subject, limit, now) }; }
    return { allowed: true, result, quota: mine };
  } catch (e) {
    await releaseDesign(tenant.id, subject, now); await releaseDesign(tenant.id, ipKey, now);
    throw e;
  }
}
