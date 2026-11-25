import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { guard, publicAccount } from "@/server/whatsapp/guard";
import { aiMode, embeddedSignupReady, metaConfig, platformConfigured, whatsappFake, WA_SUBSCRIBE_FIELDS } from "@/lib/whatsapp-flag";
import { publicOrigin } from "@/lib/origin";

/** Setup status for the admin checklist. Booleans only — no secret values. */
export async function GET(req: Request) {
  const g = await guard();
  if (!g.ok) return g.res;
  const a = await db.query.whatsappAccounts.findFirst({ where: eq(schema.whatsappAccounts.tenantId, g.tenant.id) });
  const m = metaConfig();
  return NextResponse.json({
    account: publicAccount(a),
    webhookUrl: `${publicOrigin(req)}/api/webhooks/whatsapp`,
    subscribeFields: WA_SUBSCRIBE_FIELDS,
    checks: {
      metaApp: !!(m.appId && m.appSecret), verifyToken: !!m.verifyToken, signupConfig: !!m.signupConfigId,
      platformReady: platformConfigured(), embeddedSignupReady: embeddedSignupReady(),
      ai: aiMode(), fakeMode: whatsappFake(), graphHost: new URL(m.graphBase).host, graphVersion: m.graphVersion,
      connected: a?.status === "connected",
    },
  });
}
