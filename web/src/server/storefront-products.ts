import { getTableColumns } from "drizzle-orm";
import { schema } from "@/db";
import type { Product } from "@/db/schema";

/** Product row as the storefront may see it: everything except the owner-only `internal` column (cost price, notes). */
export type StorefrontProduct = Omit<Product, "internal">;

/**
 * Column map for every storefront query. `internal` is left out on purpose: `config` is sent to the browser and this
 * keeps cost data out of every public page, JSON route and client component payload.
 */
const { internal: _internal, ...publicColumns } = getTableColumns(schema.products);
void _internal;
export const storefrontColumns = publicColumns;
