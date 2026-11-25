import { resolveTenant } from "@/lib/tenant";
import { isIndexableTenant, storefrontUrl } from "@/lib/seo/storefront";

export const dynamic = "force-dynamic";

/** Shop robots.txt. On a shop's own host this is served as /robots.txt (middleware rewrite). */
export async function GET(_req: Request, ctx: { params: Promise<{ tenant: string }> }) {
  const t = await resolveTenant((await ctx.params).tenant);
  const ok = !!t && isIndexableTenant(t);
  // paths are written for BOTH layouts: on the platform host a shop lives under /s/<slug>, on its own host at the root
  const priv = ["/cart", "/checkout", "/account", "/orders", "/walk-in/status"];
  const prefixes = ["", ...(t ? [`/s/${t.slug}`] : [])];
  const lines = ok
    ? ["User-agent: *", "Allow: /", ...prefixes.flatMap((p) => priv.map((x) => `Disallow: ${p}${x}`)), "Disallow: /api/", "", `Sitemap: ${storefrontUrl(t!, "/sitemap.xml")}`]
    : ["User-agent: *", "Disallow: /"];
  return new Response(lines.join("\n") + "\n", { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, s-maxage=3600" } });
}
