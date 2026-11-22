import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getFile } from "@/server/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const cu = await getCurrentUser();
  if (!cu || !cu.session.tid || !["owner", "staff"].includes(cu.user.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const f = await db.query.files.findFirst({ where: and(eq(schema.files.id, id), eq(schema.files.tenantId, cu.session.tid)) });
  if (!f) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (f.deletedAt) return NextResponse.json({ error: "This file was permanently deleted under the retention policy" }, { status: 410 });

  let data: Buffer;
  try { data = await getFile(f.storageKey, f.confidential); }
  catch { return NextResponse.json({ error: "File missing from storage" }, { status: 404 }); }

  if (f.confidential) await audit("file.download_confidential", { fileId: f.id, filename: f.filename, orderId: f.orderId }, cu.session.tid);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "content-type": f.mime || "application/octet-stream",
      "content-length": String(data.length),
      "content-disposition": `attachment; filename="${f.filename.replace(/["\\\r\n]/g, "_")}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
