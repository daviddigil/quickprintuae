import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Tenant } from "@/db/schema";
import { buildSellerIdentity, type SellerIdentity } from "@/lib/seller-identity";

/** The verified seller identity of a shop, or null while it is not verified. */
export async function getSellerIdentity(tenant: Tenant): Promise<SellerIdentity | null> {
  const v = await db.query.sellerVerifications.findFirst({ where: eq(schema.sellerVerifications.tenantId, tenant.id) });
  return buildSellerIdentity(tenant, v);
}
