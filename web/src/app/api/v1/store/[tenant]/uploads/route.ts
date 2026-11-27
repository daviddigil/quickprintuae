import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";
import { putFile } from "@/server/storage";
import { clientIp } from "@/server/trust/request";
import { checkUploadLimits } from "@/server/uploads/limits";
import { scanUpload } from "@/server/uploads/scan";
import { PDF_MAX_PAGES, declaredSizeError, sanitizeFilename, validateUpload } from "@/server/uploads/validate";

export const runtime = "nodejs";

const PDF_PARSE_TIMEOUT_MS = 10_000;

/** Page count of a PDF, time-boxed. Throws "timeout" / "too_many_pages" / a parse error. The caller never sends files over the PDF size cap here. */
async function pdfPages(buf: Buffer): Promise<number> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error("timeout")), PDF_PARSE_TIMEOUT_MS); });
  try {
    const n = await Promise.race([PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false }).then((d) => d.getPageCount()), timeout]);
    if (n > PDF_MAX_PAGES) throw new Error("too_many_pages");
    return n;
  } finally { clearTimeout(timer); }
}

export async function POST(req: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const tenant = await resolveTenant((await params).tenant);
  if (!tenant || tenant.status === "suspended" || tenant.status === "cancelled")
    return NextResponse.json({ error: "Store not found" }, { status: 404 });

  // cheap rejection before the body is read: oversized requests
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > 51 * 1024 * 1024 + 64 * 1024) return NextResponse.json({ error: "File is too large" }, { status: 413 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "File is empty" }, { status: 400 });
  const tooBig = declaredSizeError(file.name, file.size);
  if (tooBig) return NextResponse.json({ error: tooBig.error }, { status: tooBig.status });

  const lim = await checkUploadLimits(clientIp(req) ?? "local", tenant.id, file.size);
  if (!lim.ok) return NextResponse.json({ error: lim.error }, { status: lim.status });

  const buf = Buffer.from(await file.arrayBuffer());
  const v = validateUpload(file.name, buf); // extension allowlist, per-type size, magic bytes (file.type is never trusted)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });

  const scan = await scanUpload(buf);
  if (!scan.ok) return NextResponse.json({ error: scan.reason }, { status: 422 });

  let confidential = false;
  const productId = form.get("productId");
  if (typeof productId === "string" && productId) {
    const p = await db.query.products.findFirst({ where: and(eq(schema.products.id, productId), eq(schema.products.tenantId, tenant.id)) });
    confidential = p?.kind === "confidential_document";
  }

  let pageCount: number | null = null;
  if (v.ext === ".pdf") {
    try { pageCount = await pdfPages(buf); }
    catch (e) {
      const m = (e as Error).message;
      if (m === "too_many_pages") return NextResponse.json({ error: `This PDF has more than ${PDF_MAX_PAGES} pages. Please split it into smaller files.` }, { status: 422 });
      if (m === "timeout") return NextResponse.json({ error: "This PDF took too long to read. Please re-save or compress it and try again." }, { status: 422 });
      return NextResponse.json({ error: "This PDF could not be read. Please check the file." }, { status: 422 });
    }
  } else if (v.family === "image" && v.ext !== ".svg") {
    pageCount = 1;
  }
  const num = (k: string) => { const x = Number(form.get(k)); return Number.isFinite(x) && x > 0 && x < 100000 ? Math.round(x) : null; };

  const storageKey = await putFile(tenant.id, buf, v.ext, confidential);
  const cu = await getCurrentUser();
  const [row] = await db.insert(schema.files).values({
    tenantId: tenant.id, userId: cu && cu.session.tid === tenant.id ? cu.user.id : null,
    filename: sanitizeFilename(file.name), storageKey, mime: v.mime, size: buf.length,
    pageCount, widthPx: num("width"), heightPx: num("height"), confidential,
  }).returning();
  return NextResponse.json({ id: row.id, filename: row.filename, pageCount: row.pageCount, confidential });
}
