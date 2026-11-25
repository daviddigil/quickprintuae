/**
 * Registry of public marketing pages. Single source of truth for sitemap.xml and hreflang.
 * To add a page: append an entry. Set `translated: true` ONLY when the Arabic page (/ar/…) really exists —
 * the sitemap and hreflang alternates are generated from this flag, and a 404 alternate would hurt SEO.
 */
export interface MarketingPath {
  /** English path, e.g. "/pricing" */
  path: string;
  priority: number;
  changeFrequency: "daily" | "weekly" | "monthly" | "yearly";
  translated: boolean;
}

export const MARKETING_PATHS: MarketingPath[] = [
  { path: "/", priority: 1, changeFrequency: "weekly", translated: false },
  { path: "/pricing", priority: 0.9, changeFrequency: "weekly", translated: false },
  { path: "/signup", priority: 0.7, changeFrequency: "monthly", translated: false },
];

const norm = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p) || "/";
export const marketingPath = (path: string) => MARKETING_PATHS.find((m) => m.path === norm(path));
export const isTranslated = (path: string) => marketingPath(path)?.translated ?? false;
export const hasAnyTranslation = () => MARKETING_PATHS.some((m) => m.translated);
