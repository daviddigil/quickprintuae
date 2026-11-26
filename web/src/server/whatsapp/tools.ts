import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Tenant } from "@/db/schema";
import { computeLinePrice, PricingError, round2 } from "@/lib/pricing";
import { categoryOf, estimateSelections, needsPersonalisation } from "@/lib/storefront-catalog";
import { storefrontColumns, type StorefrontProduct } from "../storefront-products";
import { env } from "@/lib/env";
import { cfgLink } from "./cart-math";

/** All tools are scoped to one tenant and compute money with the same engine as checkout — the model never invents prices. */
export async function activeProducts(tenantId: string): Promise<StorefrontProduct[]> {
  return db.select(storefrontColumns).from(schema.products).where(and(eq(schema.products.tenantId, tenantId), eq(schema.products.active, true))).orderBy(asc(schema.products.sortOrder));
}

export async function listProducts(tenant: Tenant) {
  const ps = await activeProducts(tenant.id);
  return ps.map((p) => ({
    slug: p.slug, name: p.name, kind: p.kind, category: categoryOf(p), needs_personalisation_on_website: needsPersonalisation(p.config), description: p.description, turnaround_hours: p.turnaroundHours,
    per_page: !!p.config.perPage, quantity_presets: p.config.quantityPresets ?? null, min_quantity: p.config.minQuantity ?? null,
    from_price_aed: Math.min(...p.config.tiers.map((t) => t.unitPrice)),
    options: p.config.optionGroups.map((g) => ({ key: g.key, label: g.label, default: g.default ?? null, choices: g.choices.map((c) => ({ value: c.value, label: c.label })) })),
  }));
}

/** Polite chat reply for items that need personalisation or artwork (also used as the add_to_cart refusal). */
export function personalisationNote(name: string, url: string) {
  return `${name} needs personalisation (text and/or artwork), so it can't be added to the chat cart. Please order it on the website: ${url}`;
}

export interface QuoteArgs { product_slug: string; quantity: number; pages?: number; selections?: Record<string, string> }

export async function quotePrice(tenant: Tenant, a: QuoteArgs) {
  const ps = await activeProducts(tenant.id);
  const p = ps.find((x) => x.slug === a.product_slug);
  if (!p) return { ok: false as const, error: `Unknown product "${a.product_slug}". Use list_products for valid slugs.` };
  // products that need text or artwork from the customer cannot be completed in chat: price them, but send the customer to the website
  const needsWebsite = needsPersonalisation(p.config);
  try {
    const r = computeLinePrice(p.config, needsWebsite ? estimateSelections(p.config, a.selections ?? {}) : a.selections ?? {}, a.quantity, a.pages ?? 1);
    const vatRate = tenant.settings.vatRate ?? 5;
    const inc = tenant.settings.pricesIncludeVat;
    const subtotal = r.lineTotal;
    const vat = inc ? round2(subtotal - subtotal / (1 + vatRate / 100)) : round2(subtotal * (vatRate / 100));
    const total = inc ? subtotal : round2(subtotal + vat);
    return { ok: true as const, product: p.name, slug: p.slug, quantity: a.quantity, pages: a.pages ?? 1, chosen_options: r.labels, unit_price_aed: r.unitPrice, setup_fees_aed: r.setupFees, subtotal_aed: subtotal, vat_rate_percent: vatRate, vat_aed: vat, total_aed: total, prices_include_vat: inc, turnaround_hours: p.turnaroundHours, delivery_not_included: true, ...(needsWebsite ? { needs_website: true as const, product_url: `${env.appUrl}/s/${tenant.slug}/p/${p.slug}`, website_note: personalisationNote(p.name, `${env.appUrl}/s/${tenant.slug}/p/${p.slug}`) } : {}) };
  } catch (e) {
    if (e instanceof PricingError) return { ok: false as const, error: e.message };
    throw e;
  }
}

/** Link format matches the storefront's `?cfg=` prefill (base64url JSON {selections, quantity, pages}). */
export function buildCfgLink(tenantSlug: string, productSlug: string, a: { selections?: Record<string, string>; quantity: number; pages?: number }) {
  return cfgLink(env.appUrl, tenantSlug, { slug: productSlug, selections: a.selections ?? {}, quantity: a.quantity, pages: a.pages ?? 1 });
}

export async function sendCheckoutLink(tenant: Tenant, a: QuoteArgs) {
  const q = await quotePrice(tenant, a); // validates product, options and quantity first
  if (!q.ok) return q;
  return { ok: true as const, url: buildCfgLink(tenant.slug, a.product_slug, { selections: a.selections, quantity: a.quantity, pages: a.pages }), total_aed: q.total_aed, note: "Customer uploads files, picks pickup/delivery and pays online at this link." };
}

export async function shopInfo(tenant: Tenant) {
  const [pickups, zones] = await Promise.all([
    db.select().from(schema.pickupLocations).where(and(eq(schema.pickupLocations.tenantId, tenant.id), eq(schema.pickupLocations.active, true))),
    db.select().from(schema.deliveryZones).where(and(eq(schema.deliveryZones.tenantId, tenant.id), eq(schema.deliveryZones.active, true))),
  ]);
  const d = tenant.settings.delivery;
  return {
    shop: tenant.name, phone: tenant.phone, address: tenant.address, emirate: tenant.emirate, store_url: `${env.appUrl}/s/${tenant.slug}`,
    pickup_enabled: d?.pickupEnabled ?? true, pickup_locations: pickups.map((p) => ({ name: p.name, address: p.address, hours: p.hours })),
    delivery_enabled: d?.enabled ?? true, delivery_hours: d ? `${d.openHour}:00–${d.closeHour}:00 UAE time` : null, closed_weekdays: d?.closedWeekdays ?? [],
    delivery_zones: zones.map((z) => ({ emirate: z.emirate, fee_aed: z.fee, free_above_aed: z.freeAbove, same_day: z.sameDay })),
    payment: "Online payment only (card, Apple Pay, Google Pay via Stripe). Cash on delivery is NOT available.", vat_percent: tenant.settings.vatRate ?? 5,
  };
}

/** Best-effort product match for the rule-based fallback. */
export function matchProduct<T extends Pick<StorefrontProduct, "slug" | "name" | "kind">>(products: T[], text: string): T | undefined {
  const t = text.toLowerCase();
  const kw: Record<string, string[]> = {
    business_card: ["business card", "visiting card", "cards"], flyer: ["flyer", "leaflet"], brochure: ["brochure"], notebook: ["notebook"], poster: ["poster", "banner", "roll-up", "rollup"],
    passport_photo: ["passport", "visa photo", "visa pic"], photo_frame: ["frame"], photo: ["photo", "picture"], confidential_document: ["confidential"], document: ["document", "print", "pages", "copies"],
  };
  for (const kind of ["business_card", "flyer", "brochure", "notebook", "poster", "passport_photo", "photo_frame", "confidential_document", "photo", "document"]) {
    if (kw[kind].some((k) => t.includes(k))) { const p = products.find((x) => x.kind === kind); if (p) return p; }
  }
  return products.find((p) => t.includes(p.name.toLowerCase()) || t.includes(p.slug.replace(/-/g, " ")));
}
