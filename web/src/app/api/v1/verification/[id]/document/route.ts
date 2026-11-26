import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { canViewVerificationDocument, sniffDocument } from "@/lib/trust/verification";
import { recordTrustAudit } from "@/server/trust/audit";
import { getFile } from "@/server/storage";

export const dynamic = "force-dynamic";

/** Licence document download. Only the shop's owner and superadmins; every other request gets the same 404 (no existence leak). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return notFound();
  const cu = await getCurrentUser();
  if (!cu) return notFound();
  const v = await db.query.sellerVerifications.findFirst({ where: eq(schema.sellerVerifications.id, id) });
  if (!v?.documentKey) return notFound();
  if (!canViewVerificationDocument({ role: cu.user.role, tenantId: cu.session.tid }, v.tenantId)) return notFound();
  let buf: Buffer;
  try { buf = await getFile(v.documentKey, true); } catch { return notFound(); }
  const kind = sniffDocument(buf);
  if (!kind) return notFound();
  if (cu.user.role === "superadmin") await recordTrustAudit("verification.document_viewed", {}, { tenantId: v.tenantId, actorId: cu.user.id });
  const download = new URL(req.url).searchParams.get("download") === "1";
  return new NextResponse(new Uint8Array(buf), { headers: {
    "content-type": kind.mime, "content-disposition": `${download ? "attachment" : "inline"}; filename="licence${kind.ext}"`,
    "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
  } });
}
