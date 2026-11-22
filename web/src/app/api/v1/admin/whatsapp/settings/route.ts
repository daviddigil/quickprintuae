import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { guard, publicAccount } from "@/server/whatsapp/guard";

const Body = z.object({ aiEnabled: z.boolean().optional(), greeting: z.string().max(300).optional(), handoffMinutes: z.number().int().min(1).max(7 * 24 * 60).optional() });

export async function PATCH(req: Request) {
  const g = await guard({ ownerOnly: true });
  if (!g.ok) return g.res;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
  const [row] = await db.update(schema.whatsappAccounts).set(parsed.data).where(eq(schema.whatsappAccounts.tenantId, g.tenant.id)).returning();
  if (!row) return NextResponse.json({ error: "Connect WhatsApp first" }, { status: 404 });
  await audit("whatsapp.settings", parsed.data, g.tenant.id);
  return NextResponse.json({ account: publicAccount(row) });
}
