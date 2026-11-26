import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { ProductEditor } from "@/components/admin/ProductEditor";

export const metadata = { title: "Edit product" };

export default async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  const { tenant } = await requireStaff();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const p = await db.query.products.findFirst({ where: and(eq(schema.products.id, id), eq(schema.products.tenantId, tenant.id)) });
  if (!p) notFound();
  const cats = await db.selectDistinct({ c: schema.products.category }).from(schema.products).where(eq(schema.products.tenantId, tenant.id));
  return <ProductEditor product={{ id: p.id, kind: p.kind, name: p.name, slug: p.slug, description: p.description, imageUrl: p.imageUrl ?? "", images: p.images ?? [], category: p.category ?? "", internal: p.internal ?? {}, turnaroundHours: p.turnaroundHours, active: p.active, featured: p.featured, sortOrder: p.sortOrder, config: p.config }} storeSlug={tenant.slug} categories={cats.map((r) => r.c).filter((c): c is string => !!c)} />;
}
