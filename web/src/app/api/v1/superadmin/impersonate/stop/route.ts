import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { createSession, getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

async function stop(req: Request) {
  const s = await getSession();
  if (!s?.imp) return NextResponse.redirect(new URL("/login", req.url), 303);
  const sa = await db.query.users.findFirst({
    where: and(eq(schema.users.id, s.imp), isNull(schema.users.tenantId), eq(schema.users.role, "superadmin")),
  });
  if (!sa || !sa.active) return NextResponse.redirect(new URL("/logout?next=/login", req.url), 303);
  const tenantId = s.tid;
  await audit("impersonate.stop", {}, tenantId);
  await createSession({ uid: sa.id, role: "superadmin", tid: null });
  return NextResponse.redirect(new URL(tenantId ? `/superadmin/tenants/${tenantId}` : "/superadmin", req.url), 303);
}
export const GET = stop;
export const POST = stop;
