import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Tenant, Product } from "@/db/schema";
import { DEFAULT_TENANT_SETTINGS } from "@/lib/catalog-defaults";
import { startingPrice } from "@/components/store/price";
import { enabledProviders } from "@/server/payments";
import { storefrontColumns } from "@/server/storefront-products";
import type { ProductKind } from "@/lib/types";
import { siteUrl } from "./site";
import { printShopLd, type LdNode } from "./jsonld";

/**
 * Who may be indexed or listed: only VERIFIED sellers (trade licence approved) with an active or running-trial status.
 * Demo/test shops, 'incomplete' (no card yet), unverified, rejected, expired, suspended and cancelled shops, and expired trials are never indexed.
 * Extra slugs: env SEO_NOINDEX_SLUGS=a,b
 */
export function isIndexableTenant(t: Pick<Tenant, "slug" | "status" | "trialEndsAt" | "currentPeriodEnd" | "verificationStatus">, now = new Date()) {
  const blocked = new Set(["demo", ...(process.env.SEO_NOINDEX_SLUGS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)]);
  if (blocked.has(t.slug.toLowerCase())) return false;
  if (t.verificationStatus !== "verified") return false;
  if (t.status !== "trial" && t.status !== "active") return false;
  if (t.status === "trial" && t.trialEndsAt && t.trialEndsAt < now && !t.currentPeriodEnd) return false;
  return true;
}

/** Canonical origin of a storefront: its custom domain, else <SITE_URL>/s/<slug>. Page paths are appended ("/p/flyers"). */
export const storefrontOrigin = (t: Pick<Tenant, "slug" | "customDomain">) => (t.customDomain ? `https://${t.customDomain}` : `${siteUrl()}/s/${t.slug}`);
export const storefrontUrl = (t: Pick<Tenant, "slug" | "customDomain">, path = "") => `${storefrontOrigin(t)}${path}`;
/** Origin for metadataBase / absolute asset URLs (no /s/slug segment). */
export const storefrontHostOrigin = (t: Pick<Tenant, "customDomain">) => (t.customDomain ? `https://${t.customDomain}` : siteUrl());

export const absoluteAsset = (t: Pick<Tenant, "customDomain">, url?: string | null) => {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return `${storefrontHostOrigin(t)}${url.startsWith("/") ? url : `/${url}`}`;
};

const KIND_NOUN: Partial<Record<ProductKind, string>> = {
  document: "Document printing", confidential_document: "Confidential document printing", photo: "Photo printing", passport_photo: "Passport photo printing",
  photo_frame: "Photo framing", business_card: "Business cards printing", flyer: "Flyer printing", brochure: "Brochure printing",
  notebook: "Custom notebooks", poster: "Poster printing", sticker: "Sticker printing",
};
export const productNoun = (p: Pick<Product, "kind" | "name">) => KIND_NOUN[p.kind as ProductKind] ?? p.name;

export const trim = (s: string, max: number) => { const t = s.replace(/\s+/g, " ").trim(); return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, "")}…`; };
export const aed = (n: number) => `AED ${Number.isInteger(n) ? n : n.toFixed(2)}`;

export const deliveryCfg = (t: Pick<Tenant, "settings">) => ({ ...DEFAULT_TENANT_SETTINGS.delivery, ...(t.settings?.delivery ?? {}) });

export async function shopCatalog(t: Pick<Tenant, "id">) {
  const products = await db.select(storefrontColumns).from(schema.products).where(and(eq(schema.products.tenantId, t.id), eq(schema.products.active, true))).orderBy(asc(schema.products.sortOrder));
  return products.map((p) => ({ product: p, from: startingPrice(p) }));
}

export async function shopPlaces(t: Pick<Tenant, "id">) {
  const [pickups, zones] = await Promise.all([
    db.select().from(schema.pickupLocations).where(and(eq(schema.pickupLocations.tenantId, t.id), eq(schema.pickupLocations.active, true))),
    db.select().from(schema.deliveryZones).where(and(eq(schema.deliveryZones.tenantId, t.id), eq(schema.deliveryZones.active, true))),
  ]);
  return { pickups, zones };
}

export const paymentLabels = async (t: Tenant) => (await enabledProviders(t)).map((p) => (p === "stripe" ? "Card, Apple Pay & Google Pay (Stripe)" : "Mamo Pay"));

export async function shopLd(t: Tenant): Promise<LdNode> {
  const [catalog, { zones }] = await Promise.all([shopCatalog(t), shopPlaces(t)]);
  const prices = catalog.map((c) => c.from).filter((n): n is number => typeof n === "number");
  const d = deliveryCfg(t);
  const pay = await paymentLabels(t);
  return printShopLd({
    id: `${storefrontUrl(t)}#shop`, url: storefrontUrl(t), name: t.name,
    description: trim(t.settings?.heroSubtitle || `${t.name} — online printing in ${t.emirate}: documents, photos, business cards and more. Pickup or delivery.`, 300),
    telephone: t.phone ?? undefined, email: t.email ?? undefined, address: t.address ?? undefined, emirate: t.emirate,
    logo: absoluteAsset(t, t.logoUrl), openHour: d.openHour, closeHour: d.closeHour, closedWeekdays: d.closedWeekdays,
    areaServed: [...new Set([t.emirate, ...zones.map((z) => z.emirate)])],
    priceRange: prices.length ? `${aed(Math.min(...prices))} - ${aed(Math.max(...prices))}` : undefined,
    vatId: t.trn ?? undefined, paymentAccepted: pay.length ? pay.join(", ") : undefined,
  });
}
