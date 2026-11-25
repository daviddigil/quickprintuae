import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { superadminGuard } from "@/server/whatsapp/superadmin-guard";

/** Mark a shop's "notify me" request as handled (e.g. after you told them one-click connect is live). */
export async function PATCH(req: Request) {
  const g = await superadminGuard(); if (!g.ok) return g.res;
  const parsed = z.object({ tenantId: z.string().uuid(), notified: z.boolean() }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const [row] = await db.update(schema.whatsappActivationRequests).set({ notifiedAt: parsed.data.notified ? new Date() : null }).where(eq(schema.whatsappActivationRequests.tenantId, parsed.data.tenantId)).returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await audit("whatsapp.activation_request_updated", { tenantId: parsed.data.tenantId, notified: parsed.data.notified }, null);
  return NextResponse.json({ ok: true });
}
