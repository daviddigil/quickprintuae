import type { Copy } from "@/lib/i18n/en";
import { getLegalCopy } from "@/lib/i18n/legal";
import { SUBPROCESSORS } from "@/lib/i18n/subprocessors";
import { LEGAL_KEYS, LEGAL_PATHS } from "@/lib/legal";
import { DEFAULT_TRIAL_DAYS, getCopy, hrefFor, SOLUTION_SLUGS, type Locale } from "@/lib/i18n";

/** Single source for marketing navigation. Add a page here and it appears in the header, mobile menu and footer. */
export interface NavLink { label: string; href: string; /** submenu (desktop dropdown, indented in the mobile menu) */ children?: NavLink[] }

const solutionLabel = (c: Copy, slug: (typeof SOLUTION_SLUGS)[number]) => (slug === "print-shops" ? c.nav.printShops : slug === "walk-in-queue" ? c.nav.walkIn : c.nav.whatsapp);

/** Header links for a language. Storefront and sign-in pages (/s/demo, /login) exist once and are never prefixed. */
export function navLinks(locale: Locale = "en"): NavLink[] {
  const c = getCopy(locale), h = (p: string) => hrefFor(locale, p);
  return [
    { label: c.nav.features, href: h("/#features") },
    { label: c.nav.solutions, href: h("/#solutions"), children: SOLUTION_SLUGS.map((s) => ({ label: solutionLabel(c, s), href: h(`/solutions/${s}`) })) },
    { label: c.nav.liveStores, href: h("/stores") },
    { label: c.nav.pricing, href: h("/pricing") },
    { label: c.nav.faq, href: h("/#faq") },
    { label: c.nav.demo, href: "/s/demo" },
  ];
}

export function footerColumns(locale: Locale = "en"): { title: string; links: NavLink[] }[] {
  const c = getCopy(locale), h = (p: string) => hrefFor(locale, p), legal = getLegalCopy(locale, DEFAULT_TRIAL_DAYS);
  return [
    { title: c.footer.product, links: [{ label: c.nav.features, href: h("/#features") }, { label: c.nav.liveStores, href: h("/stores") }, { label: c.nav.pricing, href: h("/pricing") }, { label: c.footer.liveDemo, href: "/s/demo" }] },
    { title: c.footer.solutions, links: SOLUTION_SLUGS.map((s) => ({ label: solutionLabel(c, s), href: h(`/solutions/${s}`) })) },
    { title: c.footer.start, links: [{ label: c.footer.startTrial, href: h("/signup") }, { label: c.nav.signIn, href: "/login" }, { label: c.nav.faq, href: h("/#faq") }, { label: locale === "ar" ? "سياسة الاستخدام المقبول" : "Acceptable Use", href: h("/acceptable-use") }, { label: locale === "ar" ? "الإبلاغ عن محتوى" : "Report content", href: h("/report") }] },
    { title: legal.footerTitle, links: [...LEGAL_KEYS.map((k) => ({ label: legal.nav[k], href: h(LEGAL_PATHS[k]) })), { label: SUBPROCESSORS[locale].nav, href: h("/subprocessors") }] },
  ];
}

export const NAV_LINKS: NavLink[] = navLinks("en");
export const FOOTER_COLUMNS = footerColumns("en");

/**
 * Languages that have real pages. The language switcher only shows when more than one is listed,
 * so there is never a link to a page that does not exist.
 */
export const LOCALES_AVAILABLE: readonly ("en" | "ar")[] = ["en", "ar"];
