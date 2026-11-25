import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { encrypt } from "@/lib/crypto";
import { publicOrigin } from "@/lib/origin";
import { whatsappFake } from "@/lib/whatsapp-flag";
import { guard, publicAccount } from "@/server/whatsapp/guard";
import { fetchPhoneInfo, subscribeWaba } from "@/server/whatsapp/graph";

const Body = z.object({
  wabaId: z.string().trim().regex(/^\d{5,25}$/, "WhatsApp Business Account ID must be digits"),
  phoneNumberId: z.string().trim().regex(/^\d{5,25}$/, "Phone Number ID must be digits"),
  accessToken: z.string().trim().min(20).max(1000),
  appSecret: z.string().trim().min(8).max(200),
  mode: z.enum(["coexistence", "cloud"]).default("coexistence"),
});

/**
 * "Bring your own Meta app": the owner pastes WABA ID, Phone Number ID, a permanent System User token and their app secret.
 * We verify the token against Graph, subscribe the WABA, store token + secret ENCRYPTED, and generate a verify token for their webhook settings.
 */
export async function POST(req: Request) {
  const g = await guard({ ownerOnly: true });
  if (!g.ok) return g.res;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid connection data" }, { status: 400 });
  const b = parsed.data;
  const taken = await db.query.whatsappAccounts.findFirst({ where: eq(schema.whatsappAccounts.phoneNumberId, b.phoneNumberId) });
  if (taken && taken.tenantId !== g.tenant.id) return NextResponse.json({ error: "This WhatsApp number is already connected to another shop." }, { status: 409 });
  let displayPhone: string | null = null;
  if (!whatsappFake()) {
    try {
      displayPhone = (await fetchPhoneInfo(b.phoneNumberId, b.accessToken)).displayPhone; // proves the token can see this number
      await subscribeWaba(b.wabaId, b.accessToken);
    } catch (e) { return NextResponse.json({ error: `Meta rejected these details: ${(e as Error).message}` }, { status: 502 }); }
  }
  const verifyToken = taken?.connectionMethod === "manual" && taken.verifyToken ? taken.verifyToken : randomBytes(24).toString("base64url");
  const values = { tenantId: g.tenant.id, wabaId: b.wabaId, phoneNumberId: b.phoneNumberId, displayPhone, accessTokenEnc: encrypt(b.accessToken), appSecretEnc: encrypt(b.appSecret), verifyToken, mode: b.mode, status: "connected", connectionMethod: "manual", connectedAt: new Date() };
  const [row] = await db.insert(schema.whatsappAccounts).values(values).onConflictDoUpdate({ target: schema.whatsappAccounts.tenantId, set: values }).returning();
  await audit("whatsapp.connect", { phoneNumberId: b.phoneNumberId, mode: b.mode, method: "manual" }, g.tenant.id);
  return NextResponse.json({ account: publicAccount(row), webhookUrl: `${publicOrigin(req)}/api/webhooks/whatsapp` });
}
