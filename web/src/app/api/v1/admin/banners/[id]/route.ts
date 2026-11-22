import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { deleteFile } from "@/server/storage";

async function tenantId() {
  const cu = await getCurrentUser();
  return cu && cu.session.tid && ["owner", "staff"].includes(cu.user.role) ? cu.session.tid : null;
}
const Patch = z.object({
  active: z.boolean().optional(), title: z.string().max(60).optional(), subtitle: z.string().max(120).optional(),
  linkUrl: z.string().max(300).nullable().optional(), sortOrder: z.number().int().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const tid = await tenantId();
  if (!tid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const [row] = await db.update(schema.banners).set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(schema.banners.id, (await ctx.params).id), eq(schema.banners.tenantId, tid))).returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ banner: row });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const tid = await tenantId();
  if (!tid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [row] = await db.delete(schema.banners).where(and(eq(schema.banners.id, (await ctx.params).id), eq(schema.banners.tenantId, tid))).returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await deleteFile(row.storageKey);
  await audit("banner.delete", { bannerId: row.id }, tid);
  return NextResponse.json({ ok: true });
}
