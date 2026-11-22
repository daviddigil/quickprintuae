import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getFile } from "@/server/storage";

/** Public banner image. Banners are marketing assets; inactive ones are still viewable by id for admin previews. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = (await ctx.params).id;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const b = await db.query.banners.findFirst({ where: eq(schema.banners.id, id) });
  if (!b) return new Response("Not found", { status: 404 });
  const buf = await getFile(b.storageKey, false).catch(() => null);
  if (!buf) return new Response("Not found", { status: 404 });
  const headers: Record<string, string> = {
    "content-type": b.mime, "cache-control": "public, max-age=31536000, immutable",
    // SVG banners are our own generated markup; sandbox them anyway
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox", "x-content-type-options": "nosniff",
  };
  return new Response(new Uint8Array(buf), { headers });
}
