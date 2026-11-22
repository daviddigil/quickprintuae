import "server-only";
import { cache } from "react";
import { eq, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, schema } from "@/db";

/**
 * Storefront routes live under /s/[tenant]. middleware.ts rewrites
 *   <slug>.ROOT_DOMAIN/...   -> /s/<slug>/...
 *   custom-domain.com/...    -> /s/~custom-domain.com/...
 * so the param is either a slug or "~" + hostname.
 */
export const resolveTenant = cache(async (param: string) => {
  const key = decodeURIComponent(param).toLowerCase();
  const t = key.startsWith("~")
    ? await db.query.tenants.findFirst({ where: eq(schema.tenants.customDomain, key.slice(1)) })
    : await db.query.tenants.findFirst({ where: or(eq(schema.tenants.slug, key)) });
  return t ?? null;
});

export async function requireStorefrontTenant(param: string) {
  const t = await resolveTenant(param);
  if (!t || t.status === "suspended" || t.status === "cancelled") notFound();
  return t;
}

/** All storefront links use this base. Host-routed requests (subdomain / custom domain) are rewritten by middleware. */
export const storePath = (slug: string, path = "") => `/s/${slug}${path}`;
