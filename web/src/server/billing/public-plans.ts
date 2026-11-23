import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { displayFeatures } from "./flags";
import type { PublicPlan } from "@/components/platform/PricingTable";

export async function getPublicPlans(): Promise<PublicPlan[]> {
  try {
    const rows = await db.query.plans.findMany({ where: eq(schema.plans.active, true), orderBy: asc(schema.plans.sortOrder) });
    return rows.map(({ code, name, priceMonthly, priceYearly, orderFeePct, maxOrdersPerMonth, maxStaff, features, flags }) =>
      ({ code, name, priceMonthly, priceYearly, orderFeePct, maxOrdersPerMonth, maxStaff, features: displayFeatures(features, flags) }));
  } catch {
    return [];
  }
}
