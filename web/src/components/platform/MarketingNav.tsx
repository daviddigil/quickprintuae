import Link from "next/link";
import { PoweredBy } from "@/components/PoweredBy";
import { Logo } from "./Logo";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { MobileMenu } from "./MobileMenu";
import { FOOTER_COLUMNS, NAV_LINKS } from "./nav-links";

/** Frosted-glass sticky header: hairline border, blur, plain links. */
export function MarketingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-outline-variant/60 bg-surface/80 backdrop-blur-xl supports-[backdrop-filter]:bg-surface/70">
      <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="state-layer inline-flex min-h-10 items-center rounded-full px-3.5 text-sm font-medium text-on-surface-variant transition-colors hover:text-on-surface">{l.label}</Link>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          <LanguageSwitcher className="hidden md:inline-flex" />
          <Link href="/login" className="state-layer hidden min-h-10 items-center rounded-full px-4 text-sm font-semibold text-on-surface md:inline-flex">Sign in</Link>
          <Link href="/signup" className="state-layer inline-flex min-h-10 items-center rounded-full bg-primary px-4 text-sm font-semibold text-on-primary shadow-elev-1">Start free</Link>
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-outline-variant bg-surface-low">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-on-surface-variant">Online storefront, order queue and invoicing for print shops in the UAE.</p>
          <p className="proof-label mt-4">AED · excl. 5% VAT</p>
        </div>
        {FOOTER_COLUMNS.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <p className="text-sm font-semibold text-on-surface">{c.title}</p>
            <ul className="mt-3 space-y-1">
              {c.links.map((l) => <li key={l.href}><Link href={l.href} className="inline-flex min-h-9 items-center text-sm text-on-surface-variant hover:text-on-surface">{l.label}</Link></li>)}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-outline-variant/70 py-6 text-center">
        <p className="text-xs text-on-surface-variant">© {new Date().getFullYear()} QuickPrint UAE</p>
        <PoweredBy className="mt-1" />
      </div>
    </footer>
  );
}
