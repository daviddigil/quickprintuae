import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { guard, publicAccount } from "@/server/whatsapp/guard";
import { env } from "@/lib/env";

export async function GET() {
  const g = await guard();
  if (!g.ok) return g.res;
  const a = await db.query.whatsappAccounts.findFirst({ where: eq(schema.whatsappAccounts.tenantId, g.tenant.id) });
  return NextResponse.json({ account: publicAccount(a), metaConfigured: !!(env.metaAppId && env.metaAppSecret && env.metaEmbeddedSignupConfigId) });
}
