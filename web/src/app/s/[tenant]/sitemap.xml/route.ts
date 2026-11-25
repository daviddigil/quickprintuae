import { resolveTenant } from "@/lib/tenant";
import { isIndexableTenant, shopCatalog, storefrontUrl } from "@/lib/seo/storefront";

export const dynamic = "force-dynamic";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Shop sitemap: home + active product pages. 404 for demo / suspended / cancelled / expired-trial shops. */
export async function GET(_req: Request, ctx: { params: Promise<{ tenant: string }> }) {
  const t = await resolveTenant((await ctx.params).tenant);
  if (!t || !isIndexableTenant(t)) return new Response("Not found", { status: 404 });
  const catalog = await shopCatalog(t);
  const urls = [{ loc: storefrontUrl(t), lastmod: undefined as Date | undefined, priority: "1.0" }, ...catalog.map(({ product }) => ({ loc: storefrontUrl(t, `/p/${product.slug}`), lastmod: product.createdAt as Date | undefined, priority: "0.8" }))];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod.toISOString()}</lastmod>` : ""}<changefreq>weekly</changefreq><priority>${u.priority}</priority></url>`).join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
