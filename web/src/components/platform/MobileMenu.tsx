"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getCopy, hrefFor, type Locale } from "@/lib/i18n";
import { navLinks } from "./nav-links";
import { LanguageSwitcher } from "./LanguageSwitcher";

/** Menu for small screens. Closes on navigation and on Escape. The desktop links live in MarketingNav. */
export function MobileMenu({ locale = "en" }: { locale?: Locale }) {
  const c = getCopy(locale);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);
  return (
    <div className="md:hidden">
      <button type="button" aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? c.nav.closeMenu : c.nav.openMenu} onClick={() => setOpen(!open)}
        className="state-layer grid size-11 place-items-center rounded-full text-on-surface">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
        </svg>
      </button>
      {open && (
        <div id="mobile-menu" className="absolute inset-x-0 top-full border-b border-outline-variant bg-surface/95 px-4 pb-5 pt-2 shadow-elev-2 backdrop-blur-xl">
          <nav aria-label={c.nav.mobileAria} className="flex flex-col">
            {navLinks(locale).map((l) => (
              <div key={l.href}>
                <Link href={l.href} onClick={() => setOpen(false)} className="block min-h-12 content-center border-b border-outline-variant/50 text-base font-medium text-on-surface">{l.label}</Link>
                {l.children?.map((x) => <Link key={x.href} href={x.href} onClick={() => setOpen(false)} className="block min-h-11 content-center border-b border-outline-variant/40 ps-4 text-sm text-on-surface-variant">{x.label}</Link>)}
              </div>
            ))}
          </nav>
          <div className="mt-4 flex items-center gap-3">
            <Link href="/login" onClick={() => setOpen(false)} className="state-layer inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-outline text-sm font-semibold text-on-surface">{c.nav.signIn}</Link>
            <Link href={hrefFor(locale, "/signup")} onClick={() => setOpen(false)} className="state-layer inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-primary text-sm font-semibold text-on-primary">{c.nav.startFree}</Link>
            <LanguageSwitcher />
          </div>
        </div>
      )}
    </div>
  );
}
