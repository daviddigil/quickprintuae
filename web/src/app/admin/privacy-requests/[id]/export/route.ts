import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { exportCustomerData } from "@/server/privacy";

export const dynamic = "force-dynamic";

/** Shop owner downloads the export for a customer's access request (that customer's data, this shop only). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const cu = await getCurrentUser();
  if (!cu || cu.user.role !== "owner" || !cu.session.tid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const r = await db.query.dataSubjectRequests.findFirst({ where: and(eq(schema.dataSubjectRequests.id, id), eq(schema.dataSubjectRequests.tenantId, cu.session.tid)) });
  if (!r?.userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const data = await exportCustomerData(cu.session.tid, r.userId);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await audit("privacy.export", { requestId: id, userId: r.userId }, cu.session.tid);
  return new NextResponse(JSON.stringify(data, null, 2), { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="customer-data-${r.userId.slice(0, 8)}.json"`, "cache-control": "no-store" } });
}
