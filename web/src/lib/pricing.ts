import { PERSONALISATION_PREFIX, type ProductConfig, type Selections, type PriceBreakdown } from "./types";

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export class PricingError extends Error {}

/** Base unit price for a quantity from the tier table (highest tier whose min <= units). */
export function tierUnitPrice(config: ProductConfig, units: number): number {
  const tiers = [...config.tiers].sort((a, b) => a.min - b.min);
  if (!tiers.length) throw new PricingError("Product has no price tiers");
  let price = tiers[0].unitPrice;
  for (const t of tiers) if (units >= t.min) price = t.unitPrice;
  return price;
}

/**
 * Deterministic price calculation shared by the storefront (estimate) and the server (authoritative).
 * Amounts are AED, excluding VAT.
 */
export function computeLinePrice(
  config: ProductConfig,
  selections: Selections,
  quantity: number,
  pages = 1,
): PriceBreakdown {
  if (!Number.isInteger(quantity) || quantity < 1) throw new PricingError("Quantity must be a positive integer");
  if (config.minQuantity && quantity < config.minQuantity)
    throw new PricingError(`Minimum quantity is ${config.minQuantity}`);
  if (config.quantityPresets?.length && !config.quantityPresets.includes(quantity))
    throw new PricingError(`Quantity must be one of ${config.quantityPresets.join(", ")}`);
  const safePages = config.perPage ? Math.max(1, Math.floor(pages)) : 1;
  const units = quantity * safePages;

  let unit = tierUnitPrice(config, units);
  let multiplier = 1;
  let setupFees = 0;
  const labels: Record<string, string> = {};

  for (const group of config.optionGroups) {
    const value = selections[group.key] ?? group.default ?? (group.required ? undefined : group.choices[0]?.value);
    if (value === undefined) throw new PricingError(`Please choose ${group.label}`);
    const choice = group.choices.find((c) => c.value === value);
    if (!choice) throw new PricingError(`Invalid option for ${group.label}`);
    labels[group.key] = choice.label;
    unit += choice.addPerUnit ?? 0;
    multiplier *= choice.multiplier ?? 1;
    setupFees += choice.flat ?? 0;
  }

  // personalisation text fields: required / max length are enforced here (server + storefront), a filled field can add a flat fee
  for (const f of config.personalisation?.fields ?? []) {
    const raw = selections[PERSONALISATION_PREFIX + f.key];
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) { if (f.required) throw new PricingError(`Please fill in ${f.label}`); continue; }
    if (value.length > f.maxLength) throw new PricingError(`${f.label} can be at most ${f.maxLength} characters`);
    labels[PERSONALISATION_PREFIX + f.key] = value;
    setupFees += f.flat ?? 0;
  }

  const unitPrice = round2(unit * multiplier);
  const lineTotal = round2(unitPrice * units + setupFees);
  return { unitPrice, units, setupFees: round2(setupFees), lineTotal, labels };
}

export interface OrderTotals {
  subtotal: number;
  deliveryFee: number;
  discount: number;
  vat: number;
  total: number;
}

/** UAE VAT is 5%. If prices include VAT we back it out instead of adding it. */
export function computeOrderTotals(
  lineTotals: number[],
  deliveryFee: number,
  vatRate: number,
  pricesIncludeVat: boolean,
  discount = 0,
): OrderTotals {
  const subtotal = round2(lineTotals.reduce((a, b) => a + b, 0));
  const taxable = Math.max(0, subtotal + deliveryFee - discount);
  if (pricesIncludeVat) {
    const vat = round2(taxable - taxable / (1 + vatRate / 100));
    return { subtotal, deliveryFee: round2(deliveryFee), discount: round2(discount), vat, total: round2(taxable) };
  }
  const vat = round2(taxable * (vatRate / 100));
  return { subtotal, deliveryFee: round2(deliveryFee), discount: round2(discount), vat, total: round2(taxable + vat) };
}

export const formatAED = (n: number) =>
  new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", minimumFractionDigits: 2 }).format(n);
