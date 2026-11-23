import { NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { createSession, getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

/** Superadmin "log in as" the tenant owner. Accepts JSON or form posts. */
export async function POST(req: Request) {
  const cu = await getCurrentUser();
  if (!cu || cu.user.role !== "superadmin" || cu.session.imp) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const ct = req.headers.get("content-type") ?? "";
  const body: Record<string, unknown> = ct.includes("json") ? await req.json().catch(() => ({})) : Object.fromEntries((await req.formData()).entries());
  const tenantId = body.tenantId;
  // optional landing page inside the shop admin only (no open redirects)
  const next = typeof body.next === "string" && /^\/admin\/[a-z0-9\-\/]{0,100}$/i.test(body.next) && !body.next.includes("//") && !body.next.includes("..") ? body.next : "/admin";
  if (typeof tenantId !== "string") return NextResponse.json({ error: "tenantId required" }, { status: 400 });

  const owner = await db.query.users.findFirst({
    where: and(eq(schema.users.tenantId, tenantId), inArray(schema.users.role, ["owner", "staff"]), eq(schema.users.active, true)),
    orderBy: [asc(schema.users.role), asc(schema.users.createdAt)], // 'owner' sorts before 'staff' in enum order
  });
  if (!owner) return NextResponse.json({ error: "This tenant has no active owner to impersonate" }, { status: 404 });

  await audit("impersonate.start", { asUser: owner.email }, tenantId);
  await createSession({ uid: owner.id, role: owner.role, tid: tenantId, imp: cu.user.id });
  await audit("impersonate.session", { superadmin: cu.user.email }, tenantId); // logged under the impersonated session
  if (ct.includes("json")) return NextResponse.json({ ok: true, redirect: next });
  return NextResponse.redirect(new URL(next, req.url), 303);
}
