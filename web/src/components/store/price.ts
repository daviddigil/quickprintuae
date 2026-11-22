import { computeLinePrice } from "@/lib/pricing";
import type { Product } from "@/db/schema";

/** Cheapest default configuration price, for "from AED x" labels. */
export function startingPrice(p: Pick<Product, "config">) {
  try {
    const q = p.config.quantityPresets?.[0] ?? p.config.minQuantity ?? 1;
    return computeLinePrice(p.config, {}, q, 1).lineTotal;
  } catch { return null; }
}
