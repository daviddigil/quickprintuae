import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { SITE, siteUrl } from "@/lib/seo/site";
import { JsonLd } from "@/components/seo/JsonLd";
import { organizationLd, softwareApplicationLd, websiteLd } from "@/lib/seo/jsonld";
import { getSeoPlans } from "@/lib/seo/knowledge";
import { CookieNotice } from "@/components/platform/CookieNotice";

/** Pages that describe the product + plans get SoftwareApplication (with AED offers from the plans table). */
const SOFTWARE_PATHS = new Set(["/", "/pricing", "/ar", "/ar/pricing"]);

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: SITE.defaultTitle, template: `%s | ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  authors: [{ name: SITE.legalName }],
  creator: SITE.legalName,
  publisher: SITE.legalName,
  category: "business",
  formatDetection: { telephone: false, email: false, address: false },
  openGraph: { type: "website", siteName: SITE.name, locale: "en_AE", alternateLocale: ["ar_AE"], title: SITE.defaultTitle, description: SITE.description },
  twitter: { card: "summary_large_image", title: SITE.defaultTitle, description: SITE.description },
  // machine-readable summary for AI answer engines / agents (llmstxt.org)
  // canonical "./" = the current page's own URL (query string dropped); pages using pageMetadata() override it with hreflang alternates
  alternates: { canonical: "./", types: { "text/plain": [{ url: "/llms.txt", title: "llms.txt" }] } },
  // verification tokens are supplied by the operator via env (see docs/SEO.md)
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined,
  },
};

export const viewport: Viewport = {
  width: "device-width", initialScale: 1,
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#ffffff" }, { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" }],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // set by middleware: x-locale = en | ar ; x-seo-scope = platform | store | private
  const h = await headers();
  const locale = h.get("x-locale") === "ar" ? "ar" : "en";
  const scope = h.get("x-seo-scope");
  const path = (h.get("x-seo-path") ?? "").replace(/(.)\/+$/, "$1");
  const software = scope === "platform" && SOFTWARE_PATHS.has(path) ? softwareApplicationLd(await getSeoPlans()) : null;
  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <body className="min-h-screen">
        {scope === "platform" && <JsonLd data={[organizationLd(), websiteLd(), ...(software ? [software] : [])]} />}
        {children}
        {scope !== "private" && <CookieNotice locale={locale} />}
      </body>
    </html>
  );
}
