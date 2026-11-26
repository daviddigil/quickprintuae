import { NextResponse } from "next/server";
import { count, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ProductBody, issuesText, toColumns } from "@/server/product-schema";

/** Owner creates a product from scratch (the guided builder). Same validation as PUT. Slug clashes get a numeric suffix. */
export async function POST(req: Request) {
  const cu = await getCurrentUser();
  if (!cu || !cu.session.tid || !["owner", "staff"].includes(cu.user.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tid = cu.session.tid;
  const parsed = ProductBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: issuesText(parsed.error) }, { status: 400 });
  const v = parsed.data;
  const existing = await db.query.products.findMany({ where: eq(schema.products.tenantId, tid), columns: { slug: true } });
  const taken = new Set(existing.map((e) => e.slug));
  let slug = v.slug, i = 2;
  while (taken.has(slug)) slug = `${v.slug.slice(0, 74)}-${i++}`;
  const [{ n }] = await db.select({ n: count() }).from(schema.products).where(eq(schema.products.tenantId, tid));
  const cols = toColumns({ ...v, slug });
  const [p] = await db.insert(schema.products).values({ ...cols, kind: cols.kind ?? "merchandise", tenantId: tid, sortOrder: n }).returning({ id: schema.products.id, slug: schema.products.slug });
  await audit("product.create", { productId: p.id, name: v.name, builder: true }, tid);
  return NextResponse.json({ ok: true, id: p.id, slug: p.slug }, { status: 201 });
}
