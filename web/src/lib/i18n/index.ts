import { en, type Copy } from "./en";
import { ar } from "./ar";

export type { Copy, SolutionCopy } from "./en";
export type Locale = Copy["locale"];

export const getCopy = (locale: Locale): Copy => (locale === "ar" ? ar : en);
export const SOLUTION_SLUGS = ["print-shops", "walk-in-queue", "whatsapp-ordering"] as const;
export type SolutionSlug = (typeof SOLUTION_SLUGS)[number];
export const isSolutionSlug = (s: string): s is SolutionSlug => (SOLUTION_SLUGS as readonly string[]).includes(s);

/** Replace {name} placeholders. Unknown placeholders are left as is. */
export const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

/** Link helper: English path -> path for the locale ("/pricing" -> "/ar/pricing", "/#faq" -> "/ar#faq"). External-to-marketing paths (/login, /s/demo) are never prefixed. */
export function hrefFor(locale: Locale, path: string): string {
  if (locale === "en") return path;
  if (path === "/") return "/ar";
  if (path.startsWith("/#")) return `/ar${path.slice(1)}`;
  return `/ar${path}`;
}
