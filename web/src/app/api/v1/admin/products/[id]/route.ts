import { NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ProductBody, issuesText, toColumns } from "@/server/product-schema";

async function staffTenant() {
  const cu = await getCurrentUser();
  if (!cu || !cu.session.tid || !["owner", "staff"].includes(cu.user.role)) return null;
  return cu.session.tid;
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const tid = await staffTenant();
  if (!tid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = ProductBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: issuesText(parsed.error) }, { status: 400 });
  const v = parsed.data;
  const clash = await db.query.products.findFirst({ where: and(eq(schema.products.tenantId, tid), eq(schema.products.slug, v.slug), ne(schema.products.id, id)) });
  if (clash) return NextResponse.json({ error: "Another product already uses this slug" }, { status: 409 });
  const [p] = await db.update(schema.products).set(toColumns(v))
    .where(and(eq(schema.products.id, id), eq(schema.products.tenantId, tid))).returning({ id: schema.products.id });
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await audit("product.update", { productId: id, name: v.name }, tid);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const tid = await staffTenant();
  if (!tid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const [p] = await db.delete(schema.products).where(and(eq(schema.products.id, id), eq(schema.products.tenantId, tid))).returning({ id: schema.products.id });
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await audit("product.delete", { productId: id }, tid);
  return NextResponse.json({ ok: true });
}
