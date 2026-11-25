/** Single source of truth for public site identity (used by metadata, sitemap, JSON-LD, llms.txt). */
export const SITE = {
  name: "QuickPrint",
  legalName: "Nexsofture Tech",
  tagline: "Print-on-demand platform for print shops in the UAE",
  description:
    "QuickPrint lets print shops in the UAE launch an online store in minutes: documents, photos, business cards, flyers, walk-in QR queue, WhatsApp AI ordering, VAT-ready invoices, Mamo Pay and Stripe, pickup and scheduled delivery.",
  locales: ["en", "ar"] as const,
  defaultLocale: "en" as const,
  /** BCP-47 tags used in hreflang */
  hreflang: { en: "en-AE", ar: "ar-AE" } as const,
  country: "AE",
  currency: "AED",
} as const;

export type Locale = (typeof SITE.locales)[number];

/** Public origin, no trailing slash. Set SITE_URL in production (e.g. https://quickprint.ae). */
export const siteUrl = () => (process.env.SITE_URL || process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
export const abs = (path = "/") => `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
