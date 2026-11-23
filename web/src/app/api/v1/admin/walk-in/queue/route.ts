import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { hasFeature } from "@/server/billing";
import { loadWalkInQueue } from "@/app/admin/walk-in/data";

export const dynamic = "force-dynamic";

/** Live queue payload for the admin page (polled every few seconds). Scoped to the session's shop. */
export async function GET() {
  const cu = await getCurrentUser();
  if (!cu || !cu.session.tid || !["owner", "staff"].includes(cu.user.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, cu.session.tid) });
  if (!tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasFeature(tenant, "walk_in_queue"))) return NextResponse.json({ error: "Walk-in queue isn't included in your plan" }, { status: 403 });
  return NextResponse.json(await loadWalkInQueue(tenant.id), { headers: { "cache-control": "no-store" } });
}
