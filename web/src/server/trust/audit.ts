import { db, schema } from "@/db";

/** Audit row that works outside a request (webhooks, cron, tests): no cookies/headers access. */
export async function recordTrustAudit(action: string, meta: Record<string, unknown>, opts: { tenantId?: string | null; actorId?: string | null; ip?: string | null } = {}) {
  await db.insert(schema.auditLogs).values({ action, meta, tenantId: opts.tenantId ?? null, actorId: opts.actorId ?? null, ip: opts.ip ?? null });
}
