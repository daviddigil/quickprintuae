import Link from "next/link";
import { PoweredBy } from "@/components/PoweredBy";
import { fill, getCopy, hrefFor, type Locale } from "@/lib/i18n";
import { Logo } from "./Logo";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { MobileMenu } from "./MobileMenu";
import { footerColumns, navLinks } from "./nav-links";

const linkCls = "state-layer inline-flex min-h-10 items-center rounded-full px-3.5 text-sm font-medium text-on-surface-variant transition-colors hover:text-on-surface";

/** Frosted-glass sticky header: hairline border, blur, plain links. `locale` picks the language of labels and links. */
export function MarketingNav({ locale = "en" }: { locale?: Locale }) {
  const c = getCopy(locale), links = navLinks(locale);
  return (
    <header className="sticky top-0 z-40 border-b border-outline-variant/60 bg-surface/80 backdrop-blur-xl supports-[backdrop-filter]:bg-surface/70">
      <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo href={hrefFor(locale, "/")} label={c.common.homeAria} height={36} priority />
        <nav aria-label={c.nav.mainAria} className="hidden items-center gap-1 md:flex">
          {links.map((l) => l.children ? (
            <div key={l.href} className="group relative">
              <Link href={l.href} className={linkCls}>{l.label}<svg aria-hidden className="ms-1 size-3 opacity-60" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 4.5l3 3 3-3" /></svg></Link>
              <div className="invisible absolute start-0 top-full z-50 min-w-64 pt-1 opacity-0 transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                <ul className="rounded-shape-lg border border-outline-variant bg-surface-lowest p-1.5 shadow-elev-2">
                  {l.children.map((x) => <li key={x.href}><Link href={x.href} className="state-layer flex min-h-10 items-center rounded-shape-md px-3 text-sm font-medium text-on-surface">{x.label}</Link></li>)}
                </ul>
              </div>
            </div>
          ) : (
            <Link key={l.href} href={l.href} className={linkCls}>{l.label}</Link>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          <LanguageSwitcher className="hidden md:inline-flex" />
          <Link href="/login" className="state-layer hidden min-h-10 items-center rounded-full px-4 text-sm font-semibold text-on-surface md:inline-flex">{c.nav.signIn}</Link>
          <Link href={hrefFor(locale, "/signup")} className="state-layer inline-flex min-h-10 items-center rounded-full bg-primary px-4 text-sm font-semibold text-on-primary shadow-elev-1">{c.nav.startFree}</Link>
          <MobileMenu locale={locale} />
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter({ locale = "en" }: { locale?: Locale }) {
  const c = getCopy(locale);
  return (
    <footer className="border-t border-outline-variant bg-surface-low">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo href={hrefFor(locale, "/")} label={c.common.homeAria} />
          <p className="mt-3 max-w-xs text-sm text-on-surface-variant">{c.footer.tagline}</p>
          <p className="proof-label mt-4">{c.footer.note}</p>
        </div>
        {footerColumns(locale).map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <p className="text-sm font-semibold text-on-surface">{col.title}</p>
            <ul className="mt-3 space-y-1">
              {col.links.map((l) => <li key={l.href}><Link href={l.href} className="inline-flex min-h-9 items-center text-sm text-on-surface-variant hover:text-on-surface">{l.label}</Link></li>)}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-outline-variant/70 py-6 text-center">
        <p className="text-xs text-on-surface-variant">{fill(c.footer.copyright, { year: new Date().getFullYear() })}</p>
        <PoweredBy className="mt-1" label={c.common.poweredBy} />
      </div>
    </footer>
  );
}
