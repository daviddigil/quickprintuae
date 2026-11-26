import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { ProductBuilder } from "@/components/admin/ProductBuilder";

export const metadata = { title: "Build a product" };

export default async function NewProductPage() {
  const { tenant } = await requireStaff();
  const rows = await db.selectDistinct({ c: schema.products.category }).from(schema.products).where(eq(schema.products.tenantId, tenant.id));
  return <ProductBuilder categories={rows.map((r) => r.c).filter((c): c is string => !!c)} />;
}
