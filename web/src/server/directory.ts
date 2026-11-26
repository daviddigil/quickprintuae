import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db, schema } from "@/db";
import { isIndexableTenant, storefrontUrl } from "@/lib/seo/storefront";
import { filterShops, type DirectoryShop } from "@/lib/directory";

export const DIRECTORY_TAG = "directory";

/** Only fields a shop already shows on its public storefront. Never email, TRN, billing or settings. */
export async function loadDirectoryShops(now = new Date()): Promise<DirectoryShop[]> {
  const rows = await db.query.tenants.findMany({
    where: and(inArray(schema.tenants.status, ["trial", "active"]), eq(schema.tenants.directoryListed, true)),
    orderBy: [asc(schema.tenants.name)],
    limit: 2000,
  });
  const live = rows.filter((t) => isIndexableTenant(t, now));
  if (!live.length) return [];
  const pickups = await db.query.pickupLocations.findMany({ where: and(inArray(schema.pickupLocations.tenantId, live.map((t) => t.id)), eq(schema.pickupLocations.active, true)) });
  return live.map((t) => {
    const p = pickups.find((x) => x.tenantId === t.id);
    return {
      slug: t.slug, name: t.name, url: storefrontUrl(t), logoUrl: t.logoUrl, color: t.primaryColor,
      emirate: t.emirate, area: t.area, address: t.address ?? p?.address ?? null, hours: p?.hours ?? null,
      phone: t.phone, whatsapp: t.whatsapp?.replace(/[^\d]/g, "") || null,
    };
  });
}

/** Cached for 5 minutes; settings changes revalidate the DIRECTORY_TAG. */
export const getDirectoryShops = unstable_cache(async () => loadDirectoryShops(), ["directory-shops"], { revalidate: 300, tags: [DIRECTORY_TAG] });

export { filterShops };
