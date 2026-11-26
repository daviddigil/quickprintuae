/** Owner-only pricing helper: cost + target margin -> suggested sell price, and the real margin at any price. Pure, unit tested. */
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Price that earns `marginPct` of the sell price as profit (margin, not markup). e.g. cost 10, margin 50% -> 20. */
export function suggestPrice(cost: number, marginPct: number): number {
  if (!(cost >= 0) || !(marginPct >= 0) || marginPct >= 100) return 0;
  return r2(cost / (1 - marginPct / 100));
}

export function marginAt(cost: number, price: number): { profit: number; marginPct: number } {
  if (!(price > 0)) return { profit: 0, marginPct: 0 };
  const profit = r2(price - cost);
  return { profit, marginPct: r2((profit / price) * 100) };
}

export type MarginTone = "loss" | "thin" | "healthy";
/** loss: selling below cost; thin: under 25%; healthy: 25% and up */
export const marginTone = (marginPct: number): MarginTone => (marginPct < 0 ? "loss" : marginPct < 25 ? "thin" : "healthy");
