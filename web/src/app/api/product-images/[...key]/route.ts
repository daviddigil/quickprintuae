import { getFile } from "@/server/storage";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };
const KEY = /^([0-9a-f-]{36})\/(\d{4}-\d{2})\/([0-9a-f-]{36})\.(png|jpg|webp)$/;

/**
 * Public product photo. The URL is the storage key (tenantId/yyyy-mm/uuid.ext); only keys of exactly that shape are served,
 * so confidential (.enc) uploads, order files and path tricks are unreachable. Photos are unguessable and already public on the storefront.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const parts = (await ctx.params).key;
  const key = parts.join("/");
  const m = KEY.exec(key);
  if (!m) return new Response("Not found", { status: 404 });
  const buf = await getFile(key, false).catch(() => null);
  if (!buf) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(buf), {
    headers: { "content-type": TYPES[m[4]], "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox" },
  });
}
