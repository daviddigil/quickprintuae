import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { GuardError, MAX_DOCUMENT_BYTES, VerificationInput } from "@/lib/trust/verification";
import { rateLimit } from "@/server/billing/rate-limit";
import { clientIp, currentOwner } from "@/server/trust/request";
import { submitVerification, VerificationError } from "@/server/trust/verification";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Owner submits (or resubmits) the trade licence details. multipart/form-data: the fields below + `document` (PDF/JPG/PNG, 8 MB). */
export async function POST(req: Request) {
  const owner = await currentOwner();
  if (!owner) return NextResponse.json({ error: "Sign in as the shop owner." }, { status: 401 });
  if (!rateLimit(`verify:${owner.tenantId}`, 10, 60 * 60_000)) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, owner.tenantId) });
  if (!tenant || tenant.status === "incomplete") return NextResponse.json({ error: "Add your card first, then verify your business." }, { status: 409 });

  let fd: FormData;
  try { fd = await req.formData(); } catch { return NextResponse.json({ error: "Could not read the form. Try again." }, { status: 400 }); }
  const raw = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const parsed = VerificationInput.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) fields[String(i.path[0] ?? "form")] ??= i.message;
    return NextResponse.json({ error: Object.values(fields)[0], fields }, { status: 400 });
  }
  const f = fd.get("document");
  let file: Buffer | null = null;
  if (f instanceof File && f.size > 0) {
    if (f.size > MAX_DOCUMENT_BYTES) return NextResponse.json({ error: "The document is larger than 8 MB. Upload a smaller PDF, JPG or PNG.", fields: { document: "Larger than 8 MB" } }, { status: 413 });
    file = Buffer.from(await f.arrayBuffer());
  }
  try {
    await submitVerification({ tenant, ownerId: owner.user.id, ownerEmail: owner.user.email, input: parsed.data, file, ip: clientIp(req) });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message, code: e.code }, { status: 409 });
    if (e instanceof VerificationError) return NextResponse.json({ error: e.message, fields: { document: e.message } }, { status: 400 });
    console.error("verification submit failed", e);
    return NextResponse.json({ error: "Could not save your details. Please try again." }, { status: 500 });
  }
}
