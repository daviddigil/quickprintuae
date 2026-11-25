import "server-only";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { whatsappEnabled } from "@/lib/whatsapp-flag";

type Ok = { ok: true; tenant: typeof schema.tenants.$inferSelect; userId: string; role: string };
type Fail = { ok: false; res: NextResponse };

/** Platform kill-switch (WHATSAPP_ENABLED=0) + staff auth scoped to the session's tenant. */
export async function guard(opts: { ownerOnly?: boolean } = {}): Promise<Ok | Fail> {
  if (!whatsappEnabled()) return { ok: false, res: NextResponse.json({ error: "WhatsApp is switched off on this platform" }, { status: 503 }) };
  const cu = await getCurrentUser();
  if (!cu || !cu.session.tid || !["owner", "staff"].includes(cu.user.role)) return { ok: false, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (opts.ownerOnly && cu.user.role !== "owner") return { ok: false, res: NextResponse.json({ error: "Owner only" }, { status: 403 }) };
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, cu.session.tid) });
  if (!tenant) return { ok: false, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  return { ok: true, tenant, userId: cu.user.id, role: cu.user.role };
}

/** Account without secrets, safe to return to the browser. The token is never returned — only its last 4 characters. */
export const publicAccount = (a: typeof schema.whatsappAccounts.$inferSelect | undefined | null) => {
  if (!a) return null;
  const token = decrypt(a.accessTokenEnc) ?? "";
  return {
    id: a.id, displayPhone: a.displayPhone, wabaId: a.wabaId, phoneNumberId: a.phoneNumberId, mode: a.mode, status: a.status,
    connectionMethod: a.connectionMethod, aiEnabled: a.aiEnabled, greeting: a.greeting, handoffMinutes: a.handoffMinutes, connectedAt: a.connectedAt,
    lastWebhookAt: a.lastWebhookAt, tokenMask: token ? `••••${token.slice(-4)}` : null,
    /** manual connect: the verify token the owner pastes into their Meta app's webhook settings */
    verifyToken: a.connectionMethod === "manual" ? a.verifyToken : null,
  };
};
