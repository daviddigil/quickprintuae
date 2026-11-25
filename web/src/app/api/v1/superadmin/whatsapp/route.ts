import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { publicOrigin } from "@/lib/origin";
import { WA_SUBSCRIBE_FIELDS } from "@/lib/whatsapp-flag";
import { clearMetaPlatformConfig, describeMetaConfig, generateVerifyToken, saveMetaPlatformConfig } from "@/server/whatsapp/platform-config";
import { superadminGuard } from "@/server/whatsapp/superadmin-guard";

async function view(req: Request) {
  const requests = await db.select({ tenantId: schema.whatsappActivationRequests.tenantId, shop: schema.tenants.name, slug: schema.tenants.slug, createdAt: schema.whatsappActivationRequests.createdAt, notifiedAt: schema.whatsappActivationRequests.notifiedAt })
    .from(schema.whatsappActivationRequests).innerJoin(schema.tenants, eq(schema.tenants.id, schema.whatsappActivationRequests.tenantId)).orderBy(desc(schema.whatsappActivationRequests.createdAt)).limit(200);
  const origin = publicOrigin(req);
  return { config: await describeMetaConfig(), webhookUrl: `${origin}/api/webhooks/whatsapp`, subscribeFields: WA_SUBSCRIBE_FIELDS, appDomain: new URL(origin).host, requests, waiting: requests.filter((r) => !r.notifiedAt).length };
}

export async function GET(req: Request) {
  const g = await superadminGuard(); if (!g.ok) return g.res;
  return NextResponse.json(await view(req));
}

const Body = z.object({
  appId: z.string().trim().regex(/^\d{5,25}$/, "App ID is a number, e.g. 1234567890123456").optional(),
  configId: z.string().trim().regex(/^\d{5,25}$/, "Configuration ID is a number").or(z.literal("")).optional(),
  businessId: z.string().trim().regex(/^\d{5,25}$/, "Business ID is a number").or(z.literal("")).optional(),
  graphVersion: z.string().trim().regex(/^v\d{1,2}\.\d{1,2}$/, "Graph version looks like v21.0").optional(),
  /** write-only; omit to keep the stored secret */
  appSecret: z.string().trim().min(8).max(200).optional(),
  verifyToken: z.string().trim().min(8).max(120).optional(),
});

/** Save credentials. The App Secret and verify token are encrypted at rest and NEVER returned. */
export async function PUT(req: Request) {
  const g = await superadminGuard(); if (!g.ok) return g.res;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const before = await describeMetaConfig();
  const b = parsed.data;
  // first save without a verify token: generate one so the webhook handshake works straight away
  const verifyToken = b.verifyToken ?? (before.hasVerifyToken ? undefined : generateVerifyToken());
  await saveMetaPlatformConfig({ ...b, verifyToken });
  await audit("whatsapp.platform_config_saved", { appId: b.appId ?? before.appId, configId: b.configId ?? before.signupConfigId, secretChanged: !!b.appSecret, verifyTokenChanged: !!verifyToken }, null);
  return NextResponse.json(await view(req));
}

/** Remove the saved credentials (env variables, if any, become the fallback again). */
export async function DELETE(req: Request) {
  const g = await superadminGuard(); if (!g.ok) return g.res;
  await clearMetaPlatformConfig();
  await audit("whatsapp.platform_config_removed", {}, null);
  return NextResponse.json(await view(req));
}
