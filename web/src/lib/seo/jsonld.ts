import { SITE, abs, siteUrl } from "./site";
import { hasAnyTranslation } from "./paths";

/** schema.org JSON-LD builders (pure). Every builder returns a node WITHOUT "@context"; <JsonLd/> wraps nodes in one @graph. */
export type LdNode = Record<string, unknown>;

/**
 * Serialise for embedding inside <script type="application/ld+json">. Escapes < > & and the JS line separators so
 * user-controlled text (shop names, product descriptions) can never close the script tag or inject markup.
 */
export const jsonLdString = (data: unknown) =>
  JSON.stringify(data)
    .replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

export const ids = {
  org: () => `${siteUrl()}/#organization`,
  website: () => `${siteUrl()}/#website`,
  software: () => `${siteUrl()}/#software`,
};

const compact = <T extends LdNode>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0))) as T;

const sameAsFromEnv = () => (process.env.SOCIAL_LINKS ?? "").split(",").map((s) => s.trim()).filter((s) => /^https:\/\//.test(s));

export function organizationLd(): LdNode {
  return compact({
    "@type": "Organization", "@id": ids.org(), name: SITE.legalName, legalName: SITE.legalName, url: siteUrl(),
    logo: { "@type": "ImageObject", url: abs("/brand/icon-512.png"), width: 512, height: 512 },
    brand: { "@type": "Brand", name: SITE.name },
    areaServed: { "@type": "Country", name: "United Arab Emirates" },
    sameAs: sameAsFromEnv(),
  });
}

export function websiteLd(): LdNode {
  return compact({
    "@type": "WebSite", "@id": ids.website(), url: siteUrl(), name: SITE.name, description: SITE.description,
    inLanguage: hasAnyTranslation() ? [SITE.hreflang.en, SITE.hreflang.ar] : [SITE.hreflang.en],
    publisher: { "@id": ids.org() },
  });
}

export interface PlanLd {
  code: string; name: string; priceMonthly: number; priceYearly: number; orderFeePct: number; maxOrdersPerMonth: number | null; maxStaff: number | null; features: string[];
  /** 'subscription' = monthly fee, no commission; 'commission' = no monthly fee, % per paid order */
  billingModel?: string; perJobFee?: number; minOrderFee?: number; maxOrderFee?: number | null;
}
export const isCommissionPlan = (p: Pick<PlanLd, "billingModel">) => p.billingModel === "commission";
/** One-sentence, quotable description of how a plan is billed (shared by JSON-LD, llms.txt, llms-full.txt). */
export function planTerms(p: PlanLd) {
  const limits = `${p.maxOrdersPerMonth ? `up to ${p.maxOrdersPerMonth.toLocaleString("en-US")} orders per month` : "unlimited orders"}, ${p.maxStaff ? `${p.maxStaff} staff accounts` : "unlimited staff accounts"}`;
  if (isCommissionPlan(p)) {
    const extras = [p.perJobFee ? `AED ${p.perJobFee} per print job` : "", p.minOrderFee ? `minimum AED ${p.minOrderFee} per order` : "", p.maxOrderFee ? `capped at AED ${p.maxOrderFee} per order` : ""].filter(Boolean);
    return `AED 0 per month; ${p.orderFeePct}% commission on each paid order${extras.length ? ` (${extras.join(", ")})` : ""}; ${limits}`;
  }
  return `AED ${p.priceMonthly.toLocaleString("en-US")} per month or AED ${p.priceYearly.toLocaleString("en-US")} per year, no per-order commission; ${limits}`;
}

export function softwareApplicationLd(plans: PlanLd[]): LdNode {
  const offers = plans.map((p) => compact({
    "@type": "Offer", name: `${p.name} plan`, url: abs("/pricing"), price: p.priceMonthly, priceCurrency: SITE.currency,
    availability: "https://schema.org/InStock", seller: { "@id": ids.org() },
    description: `${p.name}: ${planTerms(p)}. Excludes 5% VAT. WhatsApp/Meta messages and AI usage are billed pay-as-you-go on top (per the platform rate card), after any included allowance.`,
    // commission plans: AED 0 subscription (the % commission is stated in `description`; schema.org has no percent price type)
    priceSpecification: isCommissionPlan(p) ? [
      { "@type": "UnitPriceSpecification", price: 0, priceCurrency: SITE.currency, unitCode: "MON", referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: "MON" }, valueAddedTaxIncluded: false },
    ] : [
      { "@type": "UnitPriceSpecification", price: p.priceMonthly, priceCurrency: SITE.currency, unitCode: "MON", referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: "MON" }, valueAddedTaxIncluded: false },
      { "@type": "UnitPriceSpecification", price: p.priceYearly, priceCurrency: SITE.currency, unitCode: "ANN", referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: "ANN" }, valueAddedTaxIncluded: false },
    ],
  }));
  const features = [...new Set(plans.flatMap((p) => p.features))];
  return compact({
    "@type": "SoftwareApplication", "@id": ids.software(), name: SITE.name, url: siteUrl(), description: SITE.longDescription,
    applicationCategory: "BusinessApplication", applicationSubCategory: "Print shop e-commerce software", operatingSystem: "Web",
    areaServed: { "@type": "Country", name: "United Arab Emirates" }, inLanguage: hasAnyTranslation() ? [SITE.hreflang.en, SITE.hreflang.ar] : [SITE.hreflang.en],
    featureList: features, offers, provider: { "@id": ids.org() }, publisher: { "@id": ids.org() },
  });
}

export const faqLd = (items: { q: string; a: string }[]): LdNode => ({
  "@type": "FAQPage",
  mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
});

export const breadcrumbLd = (items: { name: string; url: string }[]): LdNode => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.url })),
});

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hh = (h: number) => `${String(Math.max(0, Math.min(24, Math.floor(h)))).padStart(2, "0")}:00`;

export interface PrintShopLdInput {
  id: string; url: string; name: string; description?: string; telephone?: string; email?: string; address?: string; emirate: string;
  logo?: string; image?: string; openHour: number; closeHour: number; closedWeekdays: number[]; areaServed: string[];
  priceRange?: string; vatId?: string; paymentAccepted?: string; sameAs?: string[];
}

/** schema.org has no "PrintShop" type; a print shop is a LocalBusiness + Store. */
export function printShopLd(i: PrintShopLdInput): LdNode {
  const open = DAYS.filter((_, d) => !i.closedWeekdays.includes(d));
  return compact({
    "@type": ["LocalBusiness", "Store"], "@id": i.id, name: i.name, url: i.url, description: i.description,
    telephone: i.telephone, email: i.email, logo: i.logo, image: i.image ?? i.logo,
    address: { "@type": "PostalAddress", streetAddress: i.address, addressRegion: i.emirate, addressCountry: SITE.country },
    openingHoursSpecification: open.length ? [{ "@type": "OpeningHoursSpecification", dayOfWeek: open, opens: hh(i.openHour), closes: hh(i.closeHour) }] : undefined,
    areaServed: i.areaServed.map((n) => ({ "@type": "AdministrativeArea", name: n })),
    priceRange: i.priceRange, currenciesAccepted: SITE.currency, paymentAccepted: i.paymentAccepted, vatID: i.vatId, sameAs: i.sameAs,
  });
}

export interface ProductLdInput { url: string; name: string; description: string; category?: string; image?: string | string[]; shopId: string; shopName: string; lowPrice: number | null; vatIncluded: boolean }

/** Product with an AggregateOffer ("from" price in AED). Never emits ratings or reviews. */
export function productLd(i: ProductLdInput): LdNode {
  // all gallery photos (cover first, no duplicates); a single photo stays a plain string
  const imgs = [...new Set((Array.isArray(i.image) ? i.image : [i.image]).filter((x): x is string => !!x))];
  return compact({
    "@type": "Product", name: i.name, description: i.description, url: i.url, category: i.category, image: imgs.length > 1 ? imgs : imgs[0],
    brand: { "@type": "Brand", name: i.shopName },
    offers: i.lowPrice == null ? undefined : {
      "@type": "AggregateOffer", lowPrice: i.lowPrice, priceCurrency: SITE.currency, offerCount: 1, availability: "https://schema.org/InStock", url: i.url,
      seller: { "@id": i.shopId },
      priceSpecification: { "@type": "PriceSpecification", minPrice: i.lowPrice, priceCurrency: SITE.currency, valueAddedTaxIncluded: i.vatIncluded },
    },
  });
}
