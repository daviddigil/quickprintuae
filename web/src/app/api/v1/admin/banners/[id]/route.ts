import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { dubaiLocalToDate, safeLink } from "@/lib/banners";
import { deleteFile } from "@/server/storage";

async function tenantId() {
  const cu = await getCurrentUser();
  return cu && cu.session.tid && ["owner", "staff"].includes(cu.user.role) ? cu.session.tid : null;
}
const Patch = z.object({
  active: z.boolean().optional(), title: z.string().max(60).optional(), subtitle: z.string().max(120).optional(),
  linkUrl: z.string().max(300).nullable().optional(), sortOrder: z.number().int().optional(),
  ctaLabel: z.string().max(24).optional(),
  /** datetime-local strings in Dubai time, or "" / null to clear */
  startsAt: z.string().max(16).nullable().optional(), endsAt: z.string().max(16).nullable().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const tid = await tenantId();
  if (!tid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { startsAt, endsAt, linkUrl, ...rest } = parsed.data;
  const set: Record<string, unknown> = { ...rest, updatedAt: new Date() };
  if (linkUrl !== undefined) {
    const safe = safeLink(linkUrl);
    if (linkUrl && !safe) return NextResponse.json({ error: "Link must be a page on your store (starting with /) or an https:// address" }, { status: 400 });
    set.linkUrl = safe;
  }
  if (startsAt !== undefined) set.startsAt = dubaiLocalToDate(startsAt);
  if (endsAt !== undefined) set.endsAt = dubaiLocalToDate(endsAt);
  if ((set.startsAt && isNaN(+(set.startsAt as Date))) || (set.endsAt && isNaN(+(set.endsAt as Date)))) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  const [row] = await db.update(schema.banners).set(set)
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
