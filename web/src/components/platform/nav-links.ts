/** Single source for marketing navigation. Add a page here and it appears in the header, mobile menu and footer. */
export interface NavLink { label: string; href: string }

export const NAV_LINKS: NavLink[] = [
  { label: "Features", href: "/#features" },
  { label: "Solutions", href: "/#solutions" },
  { label: "Pricing", href: "/pricing" },
  { label: "FAQ", href: "/#faq" },
  { label: "Live demo", href: "/s/demo" },
];

export const FOOTER_COLUMNS: { title: string; links: NavLink[] }[] = [
  { title: "Product", links: [{ label: "Features", href: "/#features" }, { label: "Solutions", href: "/#solutions" }, { label: "Pricing", href: "/pricing" }, { label: "Live demo store", href: "/s/demo" }] },
  { title: "Start", links: [{ label: "Start free for 14 days", href: "/signup" }, { label: "Sign in", href: "/login" }, { label: "FAQ", href: "/#faq" }] },
];

/**
 * Languages that have real pages. The language switcher only shows when more than one is listed,
 * so there is never a link to a page that does not exist. Add "ar" when the /ar pages ship.
 */
export const LOCALES_AVAILABLE: readonly ("en" | "ar")[] = ["en"];
