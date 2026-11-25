import type { Metadata } from "next";
import { SITE, abs, type Locale } from "./site";
import { isTranslated } from "./paths";

/** English lives at /x, Arabic at /ar/x. `path` is always the English path (e.g. "/pricing", "/"). */
export const localizedPath = (path: string, locale: Locale) => {
  const p = path.startsWith("/") ? path : `/${path}`;
  return locale === "en" ? p : `/ar${p === "/" ? "" : p}`;
};

export interface PageMetaInput {
  title: string;
  description: string;
  /** English path of this page, e.g. "/", "/pricing" */
  path: string;
  locale?: Locale;
  /** default: taken from MARKETING_PATHS (hreflang alternates only for pages whose Arabic version exists). true/false overrides. */
  translated?: boolean;
  /** use the title as is (no "| QuickPrint" suffix), e.g. for the home page */
  absoluteTitle?: boolean;
  noindex?: boolean;
  /** absolute or site-relative OG image; defaults to the generated /opengraph-image */
  image?: string;
  type?: "website" | "article";
}

/** Canonical + hreflang + Open Graph + Twitter for a marketing page. Use from `export const metadata` / `generateMetadata`. */
export function pageMetadata(i: PageMetaInput): Metadata {
  const locale = i.locale ?? "en";
  const canonical = abs(localizedPath(i.path, locale));
  const languages: Record<string, string> = {};
  if (i.translated ?? isTranslated(i.path)) {
    for (const l of SITE.locales) languages[SITE.hreflang[l]] = abs(localizedPath(i.path, l));
    languages["x-default"] = abs(localizedPath(i.path, "en"));
  }
  const image = i.image ? (i.image.startsWith("http") ? i.image : abs(i.image)) : abs("/opengraph-image");
  return {
    metadataBase: new URL(abs("/")),
    title: i.absoluteTitle ? { absolute: i.title } : i.title,
    description: i.description,
    alternates: { canonical, ...(Object.keys(languages).length ? { languages } : {}) },
    robots: i.noindex ? { index: false, follow: false } : { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
    openGraph: {
      type: i.type ?? "website", url: canonical, siteName: SITE.name, title: i.title, description: i.description,
      locale: locale === "ar" ? "ar_AE" : "en_AE", images: [{ url: image, width: 1200, height: 630, alt: i.title }],
    },
    twitter: { card: "summary_large_image", title: i.title, description: i.description, images: [image] },
  };
}
