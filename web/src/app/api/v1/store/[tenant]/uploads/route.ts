import { NextResponse } from "next/server";
import path from "path";
import { and, eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";
import { putFile } from "@/server/storage";

export const runtime = "nodejs";

const MAX_BYTES = 50 * 1024 * 1024;
const ALLOWED = new Set([".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".jpg", ".jpeg", ".png", ".heic", ".webp", ".tif", ".tiff", ".ai", ".eps", ".indd", ".svg"]);

export async function POST(req: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const tenant = await resolveTenant((await params).tenant);
  if (!tenant || tenant.status === "suspended" || tenant.status === "cancelled")
    return NextResponse.json({ error: "Store not found" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "File is empty" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File is larger than 50 MB" }, { status: 413 });
  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED.has(ext)) return NextResponse.json({ error: `File type ${ext || "unknown"} is not supported` }, { status: 415 });

  let confidential = false;
  const productId = form.get("productId");
  if (typeof productId === "string" && productId) {
    const p = await db.query.products.findFirst({ where: and(eq(schema.products.id, productId), eq(schema.products.tenantId, tenant.id)) });
    confidential = p?.kind === "confidential_document";
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let pageCount: number | null = null;
  if (ext === ".pdf") {
    try { pageCount = (await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false })).getPageCount(); }
    catch { return NextResponse.json({ error: "This PDF could not be read. Please check the file." }, { status: 422 }); }
  } else if ([".jpg", ".jpeg", ".png", ".heic", ".webp", ".tif", ".tiff"].includes(ext)) {
    pageCount = 1;
  }
  const num = (k: string) => { const v = Number(form.get(k)); return Number.isFinite(v) && v > 0 && v < 100000 ? Math.round(v) : null; };

  const storageKey = await putFile(tenant.id, buf, ext, confidential);
  const cu = await getCurrentUser();
  const [row] = await db.insert(schema.files).values({
    tenantId: tenant.id, userId: cu && cu.session.tid === tenant.id ? cu.user.id : null,
    filename: file.name.slice(0, 200), storageKey, mime: file.type || "application/octet-stream", size: file.size,
    pageCount, widthPx: num("width"), heightPx: num("height"), confidential,
  }).returning();
  return NextResponse.json({ id: row.id, filename: row.filename, pageCount: row.pageCount, confidential });
}
