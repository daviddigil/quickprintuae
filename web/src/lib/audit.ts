import "server-only";
import { headers } from "next/headers";
import { db, schema } from "@/db";
import { getSession } from "./auth";

export async function audit(action: string, meta: Record<string, unknown> = {}, tenantId?: string | null) {
  const s = await getSession();
  const h = await headers();
  await db.insert(schema.auditLogs).values({
    action, meta, tenantId: tenantId ?? s?.tid ?? null, actorId: s?.uid ?? null, impersonatorId: s?.imp ?? null,
    ip: h.get("x-forwarded-for")?.split(",")[0] ?? null,
  });
}
