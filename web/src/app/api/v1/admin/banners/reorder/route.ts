import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";

/** Persist slide order: body {ids: [bannerId, ...]} in the desired order (only the caller's own banners are touched). */
export async function POST(req: Request) {
  const cu = await getCurrentUser();
  if (!cu || !cu.session.tid || !["owner", "staff"].includes(cu.user.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = z.object({ ids: z.array(z.string().uuid()).min(1).max(20) }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  await db.transaction(async (tx) => {
    for (const [i, id] of parsed.data.ids.entries())
      await tx.update(schema.banners).set({ sortOrder: i, updatedAt: new Date() }).where(and(eq(schema.banners.id, id), eq(schema.banners.tenantId, cu.session.tid!)));
  });
  return NextResponse.json({ ok: true });
}
