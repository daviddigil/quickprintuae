import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Product, Tenant } from "@/db/schema";
import { hasFeature } from "@/server/billing";
import { walkInSettings } from "./settings";

/** Extensions accepted by the walk-in upload route and createWalkInOrder (documents only — no ai/eps/indd/svg). */
export const WALK_IN_EXTENSIONS = [".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".jpg", ".jpeg", ".png"] as const;
export const WALK_IN_ACCEPT = WALK_IN_EXTENSIONS.join(",");
export const isWalkInExtension = (filename: string) => WALK_IN_EXTENSIONS.includes(("." + (filename.split(".").pop() ?? "")).toLowerCase() as never);

export type WalkInGate = { ok: true } | { ok: false; reason: "plan" | "disabled" };

/** Walk-in printing needs the plan feature AND the shop to have switched it on. */
export async function walkInGate(tenant: Tenant): Promise<WalkInGate> {
  if (!(await hasFeature(tenant, "walk_in_queue"))) return { ok: false, reason: "plan" };
  if (!walkInSettings(tenant).enabled) return { ok: false, reason: "disabled" };
  return { ok: true };
}

/** The document product walk-in jobs are priced with: settings.productId, else the first active "document" product. Never confidential. */
export async function getWalkInProduct(tenant: Tenant): Promise<Product | null> {
  const { productId } = walkInSettings(tenant);
  const where = (extra?: ReturnType<typeof eq>) => and(eq(schema.products.tenantId, tenant.id), eq(schema.products.active, true), eq(schema.products.kind, "document"), extra);
  if (productId) {
    const p = await db.query.products.findFirst({ where: where(eq(schema.products.id, productId)) });
    if (p) return p;
  }
  return (await db.query.products.findFirst({ where: where(), orderBy: [asc(schema.products.sortOrder)] })) ?? null;
}

/** Only the FIRST name is ever revealed to an unauthenticated caller ("Welcome back, Aisha"). */
export async function knownFirstName(tenantId: string, phone: string): Promise<string | null> {
  const c = await db.query.walkInCustomers.findFirst({ where: and(eq(schema.walkInCustomers.tenantId, tenantId), eq(schema.walkInCustomers.phone, phone)) });
  return c ? (c.name.trim().split(/\s+/)[0] ?? null) : null;
}
