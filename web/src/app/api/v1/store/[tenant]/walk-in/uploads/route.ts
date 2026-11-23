import { NextResponse } from "next/server";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { db, schema } from "@/db";
import { normalizePhone } from "@/lib/phone";
import { putFile } from "@/server/storage";
import { isWalkInExtension } from "@/server/walk-in/customers";
import { gateRequest, limited } from "../_gate";

export const runtime = "nodejs";
const MAX_BYTES = 50 * 1024 * 1024;

/** Walk-in upload: documents only, never confidential, rate-limited per IP and per phone. */
export async function POST(req: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const g = await gateRequest((await params).tenant);
  if ("res" in g) return g.res;
  const { tenant } = g;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const phone = normalizePhone(String(form?.get("phone") ?? ""));
  if (!form || !(file instanceof File)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  if (!phone) return NextResponse.json({ error: "Enter your mobile number first." }, { status: 400 });
  const rl = limited(req, "wi-upload", 60, 600_000, { key: `phone:${phone}`, limit: 40 });
  if (rl) return rl;

  if (file.size === 0) return NextResponse.json({ error: "File is empty" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File is larger than 50 MB" }, { status: 413 });
  const ext = path.extname(file.name).toLowerCase();
  if (!isWalkInExtension(file.name)) return NextResponse.json({ error: `${ext || "This file type"} can't be printed here. Use PDF, Word, PowerPoint, Excel, JPG or PNG.` }, { status: 415 });

  const buf = Buffer.from(await file.arrayBuffer());
  let pageCount: number | null = null;
  if (ext === ".pdf") {
    try { pageCount = (await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false })).getPageCount(); }
    catch { return NextResponse.json({ error: "This PDF could not be read. Please check the file." }, { status: 422 }); }
  } else if ([".jpg", ".jpeg", ".png"].includes(ext)) pageCount = 1;

  const storageKey = await putFile(tenant.id, buf, ext, false);
  const [row] = await db.insert(schema.files).values({
    tenantId: tenant.id, userId: null, filename: path.basename(file.name).slice(0, 200), storageKey,
    mime: file.type || "application/octet-stream", size: file.size, pageCount, confidential: false,
  }).returning();
  // pageCount null => the customer must enter pages and the job is flagged "unverified"
  return NextResponse.json({ id: row.id, filename: row.filename, pageCount: row.pageCount });
}
