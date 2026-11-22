import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { createSession, hashPassword } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";

const Body = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().min(7).max(30),
  password: z.string().min(8).max(200),
});

export async function POST(req: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const tenant = await resolveTenant((await params).tenant);
  if (!tenant) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.path[0] === "password" ? "Password must be at least 8 characters" : "Please fill in all fields correctly" }, { status: 400 });
  const { name, email, phone, password } = parsed.data;
  const exists = await db.query.users.findFirst({ where: and(eq(schema.users.tenantId, tenant.id), sql`lower(${schema.users.email}) = ${email.toLowerCase()}`) });
  if (exists) return NextResponse.json({ error: "An account with this email already exists. Please sign in." }, { status: 409 });
  const [u] = await db.insert(schema.users).values({
    tenantId: tenant.id, role: "customer", email: email.toLowerCase(), name, phone, passwordHash: await hashPassword(password),
  }).returning();
  await createSession({ uid: u.id, role: "customer", tid: tenant.id });
  return NextResponse.json({ ok: true });
}
