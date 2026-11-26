import { PERSONALISATION_PREFIX, type ProductConfig, type Selections } from "./types";

/** Category shown for products without one (the original print catalogue). */
export const DEFAULT_CATEGORY = "Print";

export const categoryOf = (p: { category?: string | null }) => (p.category?.trim() || DEFAULT_CATEGORY);

export interface CategoryGroup<T> { name: string; products: T[] }

/** Group products by category, keeping first-seen order (the products arrive sorted by sortOrder). Featured items lead each group. */
export function groupByCategory<T extends { category?: string | null; featured?: boolean }>(products: T[]): CategoryGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const p of products) {
    const k = categoryOf(p);
    const list = map.get(k) ?? [];
    list.push(p);
    map.set(k, list);
  }
  return [...map.entries()].map(([name, list]) => ({ name, products: [...list.filter((p) => p.featured), ...list.filter((p) => !p.featured)] }));
}

/** Match the `?category=` query value against the real category names (case-insensitive). Unknown value = no filter. */
export function resolveCategory(groups: { name: string }[], q?: string | string[]): string | null {
  const v = (Array.isArray(q) ? q[0] : q)?.trim().toLowerCase();
  if (!v) return null;
  return groups.find((g) => g.name.toLowerCase() === v)?.name ?? null;
}

export interface TierRow { min: number; max: number | null; unitPrice: number; savePct: number }

/** "Buy more, save more" rows from the quantity tiers (base unit price before options). Empty when there is nothing to compare. */
export function tierRows(config: Pick<ProductConfig, "tiers" | "perPage">): TierRow[] {
  if (config.perPage) return [];
  const sorted = [...config.tiers].sort((a, b) => a.min - b.min);
  // drop tiers that do not change the price
  const tiers = sorted.filter((t, i) => i === 0 || t.unitPrice !== sorted[i - 1].unitPrice);
  if (tiers.length < 2) return [];
  const base = tiers[0].unitPrice;
  return tiers.map((t, i) => ({
    min: t.min,
    max: i < tiers.length - 1 ? tiers[i + 1].min - 1 : null,
    unitPrice: t.unitPrice,
    savePct: base > 0 ? Math.round((1 - t.unitPrice / base) * 100) : 0,
  }));
}

/** The tier row that applies to a quantity. */
export const activeTier = (rows: TierRow[], qty: number) => [...rows].reverse().find((r) => qty >= r.min) ?? rows[0];

/** True when a customer cannot order this product without filling in text or uploading artwork (chat ordering must send them to the website). */
export function needsPersonalisation(config: Pick<ProductConfig, "personalisation">): boolean {
  const p = config.personalisation;
  return !!p && (p.artwork === "required" || p.fields.some((f) => f.required));
}

/** Required personalisation fields that are still empty (trimmed) in the selections. */
export function missingPersonalisation(config: Pick<ProductConfig, "personalisation">, sel: Selections) {
  return (config.personalisation?.fields ?? []).filter((f) => f.required && !(sel[PERSONALISATION_PREFIX + f.key] ?? "").trim());
}

/**
 * Selections used only for the live price estimate: empty required fields get a placeholder so the price still shows
 * while the customer is typing (validation happens separately, and authoritatively on the server).
 */
export function estimateSelections(config: Pick<ProductConfig, "personalisation">, sel: Selections): Selections {
  const out = { ...sel };
  for (const f of config.personalisation?.fields ?? []) {
    const k = PERSONALISATION_PREFIX + f.key;
    if (!(out[k] ?? "").trim()) { if (f.required) out[k] = "-"; else delete out[k]; }
  }
  return out;
}

/** Selections to store in the cart: personalisation values trimmed, empty ones dropped. */
export function cleanSelections(config: Pick<ProductConfig, "personalisation">, sel: Selections): Selections {
  const out: Selections = { ...sel };
  for (const f of config.personalisation?.fields ?? []) {
    const k = PERSONALISATION_PREFIX + f.key;
    const v = (out[k] ?? "").trim();
    if (v) out[k] = v; else delete out[k];
  }
  return out;
}

/** Human lines such as "Name on mug: Sara" for personalisation values (cart, checkout). */
export function personalisationLines(config: Pick<ProductConfig, "personalisation">, sel: Selections): string[] {
  return (config.personalisation?.fields ?? [])
    .map((f) => [f.label, (sel[PERSONALISATION_PREFIX + f.key] ?? "").trim()] as const)
    .filter(([, v]) => v)
    .map(([l, v]) => `${l}: ${v}`);
}

/** Split a stored selectionLabels entry into [label, value] for display. p_ keys carry "Label: value"; option keys are shown by key. */
export function splitLabel(key: string, value: string): [string, string] {
  if (key.startsWith(PERSONALISATION_PREFIX)) {
    const i = value.indexOf(": ");
    if (i > 0) return [value.slice(0, i), value.slice(i + 2)];
    return ["Personalisation", value];
  }
  return [key.replace(/_/g, " "), value];
}

export const isImageArtwork = (name: string) => /\.(png|jpe?g|svg|webp|gif)$/i.test(name);
