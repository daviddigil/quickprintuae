/** Tenant provisioning. No "server-only" import so the seed script can reuse it. */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import * as schema from "@/db/schema";
import { DEFAULT_PRODUCTS, DEFAULT_TENANT_SETTINGS } from "@/lib/catalog-defaults";
import { EMIRATES } from "@/lib/types";
import { ownerKeys } from "@/server/trust/keys";

export const DEFAULT_PLANS = [
  { code: "starter", aiDesignsPerCustomer: 3, name: "Starter", priceMonthly: 199, priceYearly: 1990, orderFeePct: 0, maxOrdersPerMonth: 300, maxStaff: 2, sortOrder: 1,
    flags: ["walk_in_queue"], features: ["Online storefront", "Stripe payments", "Pickup + in-house delivery", "Walk-in QR print queue", "Hero slider for offers", "All product types", "300 orders / month"] },
  { code: "growth", aiDesignsPerCustomer: 5, name: "Growth", priceMonthly: 499, priceYearly: 4990, orderFeePct: 0, maxOrdersPerMonth: 2000, maxStaff: 10, sortOrder: 2,
    flags: ["walk_in_queue"], features: ["Everything in Starter", "AI business card designer", "Courier integrations (Jeebly, Quiqup…)", "Custom domain", "10 staff"] },
  { code: "enterprise", aiDesignsPerCustomer: 15, name: "Enterprise", priceMonthly: 1499, priceYearly: 14990, orderFeePct: 0, maxOrdersPerMonth: null, maxStaff: null, sortOrder: 3,
    flags: ["walk_in_queue"], features: ["Everything in Growth", "Multiple branches", "Unlimited orders & staff", "Priority support & onboarding", "API access"] },
  { code: "payg", aiDesignsPerCustomer: 5, name: "Pay per order", priceMonthly: 0, priceYearly: 0, orderFeePct: 3, maxOrdersPerMonth: 2000, maxStaff: 5, sortOrder: 4,
    billingModel: "commission", flags: ["walk_in_queue"], features: ["No monthly fee", "Commission only on paid orders", "Everything in Growth", "Meta API & AI pay as you go"] },
];

/** Free-trial length set by the superadmin (platform_settings.trialDays), default 7. Reads through the given client so the seed script can reuse provisioning. */
async function configuredTrialDays(db: DB): Promise<number> {
  try {
    const row = await db.query.platformSettings.findFirst({ where: eq(schema.platformSettings.key, "trialDays") });
    const v = Math.round(Number(row?.value));
    return Number.isFinite(v) ? Math.min(60, Math.max(0, v)) : 7;
  } catch { return 7; }
}

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
  /** signup flow: no trial yet; the shop is 'incomplete' until a card is on file (see src/server/billing/gateway/setup.ts) */
  incomplete?: boolean;
  /** mark the seller as verified straight away (demo shop, tests). Real shops go through /admin/verification. */
  verified?: boolean;
}

export async function provisionTenant(db: DB, input: ProvisionInput) {
  await ensurePlans(db);
  const plan = await db.query.plans.findFirst({ where: eq(schema.plans.code, input.planCode ?? "growth") });
  const emirate = input.emirate ?? "Dubai";
  return db.transaction(async (tx) => {
    const [tenant] = await tx.insert(schema.tenants).values({
      slug: input.slug.toLowerCase(),
      name: input.shopName,
      primaryColor: "#3300ff",
      email: input.ownerEmail.toLowerCase(),
      phone: input.phone,
      emirate,
      planId: plan?.id,
      status: input.incomplete ? "incomplete" : "trial",
      cardStatus: input.incomplete ? "pending" : "none",
      verificationStatus: input.verified ? "verified" : "unverified",
      trialEndsAt: input.incomplete ? null : new Date(Date.now() + (input.trialDays ?? await configuredTrialDays(db)) * 86400_000),
      settings: { ...DEFAULT_TENANT_SETTINGS, orderPrefix: input.slug.slice(0, 3).toUpperCase() },
    }).returning();
    const [owner] = await tx.insert(schema.users).values({
      tenantId: tenant.id, role: "owner", email: input.ownerEmail.toLowerCase(), name: input.ownerName,
      phone: input.phone, ...ownerKeys(input.ownerEmail, input.phone), passwordHash: await bcrypt.hash(input.ownerPassword, 10),
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
