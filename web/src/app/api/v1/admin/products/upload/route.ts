import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { MAX_UPLOAD_BYTES, sniffImage } from "@/lib/banners";
import { putFile } from "@/server/storage";

/** Owner uploads a product photo. multipart/form-data: file. Returns { url } that the storefront can load (served by /api/product-images). */
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
  const key = await putFile(tenantId, Buffer.from(buf), kind.ext, false); // `${tenantId}/${yyyy-mm}/${uuid}${ext}`
  await audit("product.photo_upload", { bytes: file.size }, tenantId);
  return NextResponse.json({ url: `/api/product-images/${key}` });
}
