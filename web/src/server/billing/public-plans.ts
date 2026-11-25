import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { displayFeatures } from "./flags";
import { USAGE_KINDS } from "@/lib/usage";
import type { PublicPlan, PublicUsageRate } from "@/components/platform/PricingTable";

export async function getPublicPlans(): Promise<PublicPlan[]> {
  try {
    const rows = await db.query.plans.findMany({ where: eq(schema.plans.active, true), orderBy: asc(schema.plans.sortOrder) });
    return rows.map(({ code, name, priceMonthly, priceYearly, orderFeePct, maxOrdersPerMonth, maxStaff, features, flags, billingModel, includedUsage }) =>
      ({ code, name, priceMonthly, priceYearly, orderFeePct, maxOrdersPerMonth, maxStaff, features: displayFeatures(features, flags),
        billingModel: billingModel === "commission" ? "commission" : "subscription", includedUsage: includedUsage ?? {} }));
  } catch {
    return [];
  }
}

/** Active, non-zero pay-as-you-go rates set by the superadmin (AED per unit). Empty when none are billed yet. */
export async function getPublicUsageRates(): Promise<PublicUsageRate[]> {
  try {
    const rows = await db.query.usageRates.findMany({ where: eq(schema.usageRates.active, true) });
    return USAGE_KINDS.flatMap((k) => {
      const r = rows.find((x) => x.kind === k.kind);
      return r && r.priceAed > 0 ? [{ kind: k.kind, label: k.label, unit: k.unit, priceAed: r.priceAed }] : [];
    });
  } catch {
    return [];
  }
}
