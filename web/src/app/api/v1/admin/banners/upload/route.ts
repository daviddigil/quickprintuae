import { NextResponse } from "next/server";
import { count, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { MAX_SLIDES, MAX_UPLOAD_BYTES, dubaiLocalToDate, safeLink, sniffImage } from "@/lib/banners";
import { putFile } from "@/server/storage";

/** Owner uploads their own offer image for the hero slider. multipart/form-data: file (+ title, subtitle, linkUrl, ctaLabel, startsAt, endsAt). */
export async function POST(req: Request) {
  const cu = await getCurrentUser();
  if (!cu || !cu.session.tid || !["owner", "staff"].includes(cu.user.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenantId = cu.session.tid;

  let fd: FormData;
  try { fd = await req.formData(); } catch { return NextResponse.json({ error: "Expected a file upload" }, { status: 400 }); }
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Choose an image to upload" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Image is too large (max 5 MB)" }, { status: 413 });

  const buf = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(buf);
  if (!kind) return NextResponse.json({ error: "Only JPG, PNG or WebP images are allowed" }, { status: 415 });

  const [{ n }] = await db.select({ n: count() }).from(schema.banners).where(eq(schema.banners.tenantId, tenantId));
  if (n >= MAX_SLIDES) return NextResponse.json({ error: `You can have up to ${MAX_SLIDES} slides. Delete one first.` }, { status: 409 });

  const text = (k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max);
  const linkRaw = text("linkUrl", 300);
  const linkUrl = safeLink(linkRaw);
  if (linkRaw && !linkUrl) return NextResponse.json({ error: "Link must be a page on your store (starting with /) or an https:// address" }, { status: 400 });
  const startsAt = dubaiLocalToDate(text("startsAt", 16)), endsAt = dubaiLocalToDate(text("endsAt", 16));
  if ((startsAt && isNaN(+startsAt)) || (endsAt && isNaN(+endsAt))) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  if (startsAt && endsAt && endsAt <= startsAt) return NextResponse.json({ error: "End date must be after the start date" }, { status: 400 });

  const key = await putFile(tenantId, Buffer.from(buf), kind.ext, false);
  const [banner] = await db.insert(schema.banners).values({
    tenantId, title: text("title", 60), subtitle: text("subtitle", 120), ctaLabel: text("ctaLabel", 24), linkUrl, prompt: "",
    storageKey: key, mime: kind.mime, source: "upload", startsAt, endsAt, sortOrder: n,
  }).returning();
  await audit("banner.upload", { bannerId: banner.id, bytes: file.size }, tenantId);
  return NextResponse.json({ banner });
}
