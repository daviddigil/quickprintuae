import { en, type Copy } from "./en";
import { ar } from "./ar";
import { fillTrialString, trialFact } from "./trial";

/** Server-side last primed trial length (set by platform-settings); client components must be passed `trialDays` explicitly. */
export const DEFAULT_TRIAL_DAYS = 7;
const currentTrialDays = (): number => (globalThis as unknown as { __qpTrial?: { days: number } }).__qpTrial?.days ?? DEFAULT_TRIAL_DAYS;

export { trialLabel } from "./trial";

export type { Copy, SolutionCopy } from "./en";
export type Locale = Copy["locale"];

const mapStrings = <T,>(v: T, f: (s: string) => string): T => {
  if (typeof v === "string") return f(v) as unknown as T;
  if (Array.isArray(v)) return v.map((x) => mapStrings(x, f)) as unknown as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapStrings(x, f)])) as T;
  return v;
};

const memo = new Map<string, Copy>();
/**
 * Dictionary for a locale with {trialDays} filled from the superadmin setting (see platform-settings).
 * Server pages call `await primeTrialDays()` first so the value is current; the default is 7. Memoised per locale + days.
 */
export function getCopy(locale: Locale, trialDays?: number): Copy {
  const days = trialDays ?? currentTrialDays();
  const key = `${locale}:${days}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const base: Copy = locale === "ar" ? ar : en;
  const out = mapStrings(base, (s) => fillTrialString(s, days, locale));
  const facts = out.home.trust.facts;
  if (facts.length > 3) facts[3] = { ...facts[3], ...trialFact(days, locale) };
  memo.set(key, out);
  return out;
}
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
