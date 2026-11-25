"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { localizedPath } from "@/lib/seo/metadata";
import { LOCALES_AVAILABLE } from "./nav-links";

/** Switches between English and Arabic versions of the current marketing page. Renders nothing until a second language has pages. */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const path = usePathname() || "/";
  if (LOCALES_AVAILABLE.length < 2) return null;
  const isAr = path === "/ar" || path.startsWith("/ar/");
  const enPath = isAr ? path.replace(/^\/ar/, "") || "/" : path;
  const target = isAr ? enPath : localizedPath(enPath, "ar");
  return (
    <Link href={target} hrefLang={isAr ? "en-AE" : "ar-AE"} lang={isAr ? "en" : "ar"} className={`state-layer inline-flex min-h-10 items-center rounded-full px-3 text-sm font-semibold text-on-surface-variant ${className}`}>
      {isAr ? "English" : "العربية"}
    </Link>
  );
}
