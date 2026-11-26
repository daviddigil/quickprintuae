import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { isIndexableTenant, storefrontUrl } from "@/lib/seo/storefront";
import { filterShops, type DirectoryShop } from "@/lib/directory";

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

/**
 * Small in-memory cache (60 s) shared through globalThis so server actions and pages see the same copy.
 * Deliberately not next/cache: no filesystem cache dir is needed (works the same in the Docker standalone image).
 */
const g = globalThis as unknown as { __qpDirectory?: { at: number; shops: DirectoryShop[] } };
export function invalidateDirectory() { g.__qpDirectory = undefined; }
export async function getDirectoryShops(): Promise<DirectoryShop[]> {
  const c = g.__qpDirectory;
  if (c && Date.now() - c.at < 60_000) return c.shops;
  const shops = await loadDirectoryShops();
  g.__qpDirectory = { at: Date.now(), shops };
  return shops;
}

export { filterShops };
