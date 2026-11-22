import "server-only";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { COMING_SOON, whatsappEnabled } from "@/lib/whatsapp-flag";

type Ok = { ok: true; tenant: typeof schema.tenants.$inferSelect; userId: string; role: string };
type Fail = { ok: false; res: NextResponse };

/** Feature flag (503 when off) + staff auth scoped to the session's tenant. */
export async function guard(opts: { ownerOnly?: boolean } = {}): Promise<Ok | Fail> {
  if (!whatsappEnabled()) return { ok: false, res: NextResponse.json(COMING_SOON, { status: 503 }) };
  const cu = await getCurrentUser();
  if (!cu || !cu.session.tid || !["owner", "staff"].includes(cu.user.role)) return { ok: false, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (opts.ownerOnly && cu.user.role !== "owner") return { ok: false, res: NextResponse.json({ error: "Owner only" }, { status: 403 }) };
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, cu.session.tid) });
  if (!tenant) return { ok: false, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  return { ok: true, tenant, userId: cu.user.id, role: cu.user.role };
}

/** Account without secrets, safe to return to the browser. */
export const publicAccount = (a: typeof schema.whatsappAccounts.$inferSelect | undefined | null) =>
  a ? { id: a.id, displayPhone: a.displayPhone, wabaId: a.wabaId, mode: a.mode, status: a.status, aiEnabled: a.aiEnabled, greeting: a.greeting, handoffMinutes: a.handoffMinutes, connectedAt: a.connectedAt } : null;
