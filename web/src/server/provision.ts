/** Tenant provisioning. No "server-only" import so the seed script can reuse it. */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import * as schema from "@/db/schema";
import { DEFAULT_PRODUCTS, DEFAULT_TENANT_SETTINGS } from "@/lib/catalog-defaults";
import { EMIRATES } from "@/lib/types";

export const DEFAULT_PLANS = [
  { code: "starter", name: "Starter", priceMonthly: 199, priceYearly: 1990, orderFeePct: 2, maxOrdersPerMonth: 300, maxStaff: 2, sortOrder: 1,
    flags: ["walk_in_queue"], features: ["Online storefront", "Stripe & Mamo Pay", "Pickup + in-house delivery", "Walk-in QR print queue", "Hero slider for offers", "All product types", "300 orders / month"] },
  { code: "growth", name: "Growth", priceMonthly: 499, priceYearly: 4990, orderFeePct: 1, maxOrdersPerMonth: 2000, maxStaff: 10, sortOrder: 2,
    flags: ["walk_in_queue"], features: ["Everything in Starter", "AI business card designer", "Courier integrations (Jeebly, Quiqup…)", "Custom domain", "10 staff"] },
  { code: "enterprise", name: "Enterprise", priceMonthly: 1499, priceYearly: 14990, orderFeePct: 0.5, maxOrdersPerMonth: null, maxStaff: null, sortOrder: 3,
    flags: ["walk_in_queue"], features: ["Everything in Growth", "Multiple branches", "Unlimited orders & staff", "Priority support & onboarding", "API access"] },
];

export async function ensurePlans(db: DB) {
  for (const p of DEFAULT_PLANS) {
    const exists = await db.query.plans.findFirst({ where: eq(schema.plans.code, p.code) });
    if (!exists) await db.insert(schema.plans).values(p);
  }
}

export interface ProvisionInput {
  shopName: string;
  slug: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  phone?: string;
  emirate?: string;
  planCode?: string;
  trialDays?: number;
}

export async function provisionTenant(db: DB, input: ProvisionInput) {
  await ensurePlans(db);
  const plan = await db.query.plans.findFirst({ where: eq(schema.plans.code, input.planCode ?? "growth") });
  const emirate = input.emirate ?? "Dubai";
  return db.transaction(async (tx) => {
    const [tenant] = await tx.insert(schema.tenants).values({
      slug: input.slug.toLowerCase(),
      name: input.shopName,
      email: input.ownerEmail.toLowerCase(),
      phone: input.phone,
      emirate,
      planId: plan?.id,
      status: "trial",
      trialEndsAt: new Date(Date.now() + (input.trialDays ?? 14) * 86400_000),
      settings: { ...DEFAULT_TENANT_SETTINGS, orderPrefix: input.slug.slice(0, 3).toUpperCase() },
    }).returning();
    const [owner] = await tx.insert(schema.users).values({
      tenantId: tenant.id, role: "owner", email: input.ownerEmail.toLowerCase(), name: input.ownerName,
      phone: input.phone, passwordHash: await bcrypt.hash(input.ownerPassword, 10),
    }).returning();
    await tx.insert(schema.products).values(DEFAULT_PRODUCTS.map((p, i) => ({ ...p, tenantId: tenant.id, sortOrder: i, featured: !!p.featured })));
    await tx.insert(schema.pickupLocations).values({ tenantId: tenant.id, name: `${input.shopName} – Main branch`, address: "Update your address in Settings", emirate });
    await tx.insert(schema.deliveryZones).values(EMIRATES.map((e) => ({
      tenantId: tenant.id, emirate: e,
      fee: e === emirate ? 15 : ["Dubai", "Sharjah", "Ajman"].includes(e) && ["Dubai", "Sharjah", "Ajman"].includes(emirate) ? 20 : 30,
      freeAbove: 200, minLeadHours: e === emirate ? 4 : 24, sameDay: e === emirate,
    })));
    return { tenant, owner };
  });
}
