import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { createSession, getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { publicOrigin } from "@/lib/origin";

async function stop(req: Request) {
  const s = await getSession();
  if (!s?.imp) return NextResponse.redirect(new URL("/login", publicOrigin(req)), 303);
  const sa = await db.query.users.findFirst({
    where: and(eq(schema.users.id, s.imp), isNull(schema.users.tenantId), eq(schema.users.role, "superadmin")),
  });
  if (!sa || !sa.active) return NextResponse.redirect(new URL("/logout?next=/login", publicOrigin(req)), 303);
  const tenantId = s.tid;
  await audit("impersonate.stop", {}, tenantId);
  await createSession({ uid: sa.id, role: "superadmin", tid: null });
  return NextResponse.redirect(new URL(tenantId ? `/superadmin/tenants/${tenantId}` : "/superadmin", publicOrigin(req)), 303);
}
export const GET = stop;
export const POST = stop;
