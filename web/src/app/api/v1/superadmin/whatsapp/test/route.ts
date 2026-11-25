import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { recordMetaTest, testMetaCredentials } from "@/server/whatsapp/platform-config";
import { superadminGuard } from "@/server/whatsapp/superadmin-guard";

/** "Test credentials": asks Meta's Graph API about the app using appId|appSecret. May use unsaved form values (secret optional = use the stored one). */
export async function POST(req: Request) {
  const g = await superadminGuard(); if (!g.ok) return g.res;
  const parsed = z.object({ appId: z.string().trim().max(30).optional(), appSecret: z.string().trim().max(200).optional() }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const r = await testMetaCredentials({ appId: parsed.data.appId || undefined, appSecret: parsed.data.appSecret || undefined });
  if (!parsed.data.appSecret && !parsed.data.appId) await recordMetaTest(r.ok, r.message); // tested the saved credentials -> remember the result
  await audit("whatsapp.platform_config_tested", { ok: r.ok }, null);
  return NextResponse.json(r, { status: 200 });
}
