/**
 * Legacy handling for the removed second gateway. Old `payments` / `orders` rows and platform_gateways rows keep their stored
 * provider value; this file is the only place that knows it, so views can still label those rows.
 * (Listed in the no-legacy-provider copy test as an allowed file.)
 */
export const LEGACY_PROVIDER = "mamo";
export const LEGACY_PLAN_FEATURE = "Stripe & Mamo Pay";

/** Human label for any stored provider value. Unknown values are shown as given. */
export function providerLabel(p: string | null | undefined): string {
  if (!p) return "Unknown";
  if (p === "stripe") return "Stripe";
  if (p === LEGACY_PROVIDER) return "Mamo Pay (legacy)";
  return p;
}
