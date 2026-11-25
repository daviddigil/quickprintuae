import { fill } from "@/lib/i18n";
import type { Copy } from "@/lib/i18n/en";

type PriceCopy = Copy["priceTable"];

/** Display-only translation of plan data that comes from the database. Unknown strings are shown as stored (English). */
export const trPlanName = (t: PriceCopy, name: string) => t.planNames[name] ?? name;

export function trFeature(t: PriceCopy, feature: string): string {
  if (t.features[feature]) return t.features[feature];
  const m = /^Everything in (.+)$/i.exec(feature);
  if (m && Object.keys(t.planNames).length) return fill(t.everythingIn, { plan: trPlanName(t, m[1]) });
  return feature;
}
