import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { guard, publicAccount } from "@/server/whatsapp/guard";
import { aiMode, whatsappFake, WA_SUBSCRIBE_FIELDS } from "@/lib/whatsapp-flag";
import { getMetaPlatformConfig, readiness } from "@/server/whatsapp/platform-config";
import { publicOrigin } from "@/lib/origin";

/** Setup status for the admin panel. Booleans + PUBLIC ids only (appId / configId are public identifiers needed by the Facebook JS SDK) — never secrets. */
export async function GET(req: Request) {
  const g = await guard();
  if (!g.ok) return g.res;
  const [a, m, request] = await Promise.all([
    db.query.whatsappAccounts.findFirst({ where: eq(schema.whatsappAccounts.tenantId, g.tenant.id) }),
    getMetaPlatformConfig(),
    db.query.whatsappActivationRequests.findFirst({ where: eq(schema.whatsappActivationRequests.tenantId, g.tenant.id) }),
  ]);
  const r = readiness(m);
  return NextResponse.json({
    account: publicAccount(a),
    webhookUrl: `${publicOrigin(req)}/api/webhooks/whatsapp`,
    subscribeFields: WA_SUBSCRIBE_FIELDS,
    /** drives the one-click button: ready = Embedded Signup popup, otherwise the "activation pending" sheet */
    platform: { ready: r.embeddedSignupReady, appId: r.embeddedSignupReady ? m.appId ?? null : null, configId: r.embeddedSignupReady ? m.signupConfigId ?? null : null, graphVersion: m.graphVersion },
    activationRequested: !!request,
    checks: {
      metaApp: !!(m.appId && m.appSecret), verifyToken: !!m.verifyToken, signupConfig: !!m.signupConfigId,
      platformReady: r.platformReady, embeddedSignupReady: r.embeddedSignupReady,
      ai: aiMode(), fakeMode: whatsappFake(), graphHost: new URL(m.graphBase).host, graphVersion: m.graphVersion,
      connected: a?.status === "connected",
    },
  });
}
