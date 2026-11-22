import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { encrypt } from "@/lib/crypto";
import { guard, publicAccount } from "@/server/whatsapp/guard";
import { exchangeCode, fetchDisplayPhone, subscribeWaba } from "@/server/whatsapp/graph";
import { whatsappFake } from "@/lib/whatsapp-flag";

const Body = z.object({ code: z.string().min(5).max(2000), wabaId: z.string().regex(/^\d+$/), phoneNumberId: z.string().regex(/^\d+$/), mode: z.enum(["coexistence", "cloud"]).default("coexistence") });

/** Embedded Signup callback: exchange the code, subscribe the app to the WABA, store the encrypted token. */
export async function POST(req: Request) {
  const g = await guard({ ownerOnly: true });
  if (!g.ok) return g.res;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid connection data" }, { status: 400 });
  const b = parsed.data;
  const taken = await db.query.whatsappAccounts.findFirst({ where: eq(schema.whatsappAccounts.phoneNumberId, b.phoneNumberId) });
  if (taken && taken.tenantId !== g.tenant.id) return NextResponse.json({ error: "This WhatsApp number is already connected to another shop." }, { status: 409 });
  try {
    const token = whatsappFake() ? "fake-token" : await exchangeCode(b.code);
    if (!whatsappFake()) await subscribeWaba(b.wabaId, token);
    const displayPhone = whatsappFake() ? null : await fetchDisplayPhone(b.phoneNumberId, token);
    const values = { tenantId: g.tenant.id, wabaId: b.wabaId, phoneNumberId: b.phoneNumberId, displayPhone, accessTokenEnc: encrypt(token), mode: b.mode, status: "connected", connectedAt: new Date() };
    const [row] = await db.insert(schema.whatsappAccounts).values(values).onConflictDoUpdate({ target: schema.whatsappAccounts.tenantId, set: values }).returning();
    await audit("whatsapp.connect", { phoneNumberId: b.phoneNumberId, mode: b.mode }, g.tenant.id);
    return NextResponse.json({ account: publicAccount(row) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function DELETE() {
  const g = await guard({ ownerOnly: true });
  if (!g.ok) return g.res;
  await db.update(schema.whatsappAccounts).set({ status: "disconnected" }).where(eq(schema.whatsappAccounts.tenantId, g.tenant.id));
  await audit("whatsapp.disconnect", {}, g.tenant.id);
  return NextResponse.json({ ok: true });
}
