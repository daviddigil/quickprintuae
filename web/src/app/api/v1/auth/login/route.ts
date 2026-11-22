import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { createSession, verifyPassword } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  /** storefront slug when a customer logs in to a shop; omitted for staff/owner/superadmin login */
  store: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid email or password" }, { status: 400 });
  const { email, password, store } = parsed.data;
  const lower = email.toLowerCase();

  let candidates;
  if (store) {
    const tenant = await resolveTenant(store);
    if (!tenant) return NextResponse.json({ error: "Store not found" }, { status: 404 });
    candidates = await db.select().from(schema.users).where(and(eq(schema.users.tenantId, tenant.id), sql`lower(${schema.users.email}) = ${lower}`));
  } else {
    // staff/owner of any tenant or platform superadmin
    candidates = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${lower} and ${schema.users.role} <> 'customer'`);
    const sa = await db.select().from(schema.users).where(and(isNull(schema.users.tenantId), sql`lower(${schema.users.email}) = ${lower}`));
    candidates = [...sa, ...candidates.filter((c) => c.tenantId)];
  }

  for (const u of candidates) {
    if (u.active && (await verifyPassword(password, u.passwordHash))) {
      await createSession({ uid: u.id, role: u.role, tid: u.tenantId });
      await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, u.id));
      const redirect = u.role === "superadmin" ? "/superadmin" : u.role === "customer" ? null : "/admin";
      return NextResponse.json({ ok: true, role: u.role, redirect });
    }
  }
  return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
}
