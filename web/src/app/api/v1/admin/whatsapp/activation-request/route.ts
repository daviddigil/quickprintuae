import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { guard } from "@/server/whatsapp/guard";
import { getMetaPlatformConfig, readiness } from "@/server/whatsapp/platform-config";

/** "Notify me when one-click connect is ready". Idempotent: one row per shop; repeating returns alreadyRequested. */
export async function POST() {
  const g = await guard({ ownerOnly: true });
  if (!g.ok) return g.res;
  if (readiness(await getMetaPlatformConfig()).embeddedSignupReady) return NextResponse.json({ ready: true, requested: false });
  const existing = await db.query.whatsappActivationRequests.findFirst({ where: eq(schema.whatsappActivationRequests.tenantId, g.tenant.id) });
  if (existing) return NextResponse.json({ requested: true, alreadyRequested: true });
  await db.insert(schema.whatsappActivationRequests).values({ tenantId: g.tenant.id, requestedBy: g.userId }).onConflictDoNothing();
  await audit("whatsapp.activation_requested", {}, g.tenant.id);
  return NextResponse.json({ requested: true, alreadyRequested: false });
}
