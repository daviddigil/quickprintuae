import type { MetadataRoute } from "next";
import { and, asc, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { abs, SITE } from "@/lib/seo/site";
import { MARKETING_PATHS } from "@/lib/seo/paths";
import { localizedPath } from "@/lib/seo/metadata";
import { isIndexableTenant, storefrontUrl } from "@/lib/seo/storefront";

export const dynamic = "force-dynamic";

/**
 * Platform sitemap: marketing pages (with hreflang alternates for translated pages) + the home page of every indexable shop that has no
 * custom domain of its own. Shops publish their own full sitemap at /s/<slug>/sitemap.xml (and /sitemap.xml on their own host).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const out: MetadataRoute.Sitemap = [];
  for (const m of MARKETING_PATHS) {
    const languages = m.translated ? { [SITE.hreflang.en]: abs(localizedPath(m.path, "en")), [SITE.hreflang.ar]: abs(localizedPath(m.path, "ar")), "x-default": abs(localizedPath(m.path, "en")) } : undefined;
    out.push({ url: abs(m.path), lastModified: now, changeFrequency: m.changeFrequency, priority: m.priority, ...(languages ? { alternates: { languages } } : {}) });
    if (m.translated) out.push({ url: abs(localizedPath(m.path, "ar")), lastModified: now, changeFrequency: m.changeFrequency, priority: Math.max(0.1, m.priority - 0.1), alternates: { languages: languages! } });
  }
  try {
    const shops = await db.select().from(schema.tenants).where(and(inArray(schema.tenants.status, ["trial", "active"]))).orderBy(asc(schema.tenants.createdAt)).limit(2000);
    for (const t of shops) if (!t.customDomain && isIndexableTenant(t, now)) out.push({ url: storefrontUrl(t), lastModified: t.createdAt, changeFrequency: "weekly", priority: 0.5 });
  } catch { /* database unavailable: marketing pages only */ }
  return out;
}
