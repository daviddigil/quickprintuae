import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { createSession, hashPassword, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { resolveTenant } from "@/lib/tenant";
import { clientIp } from "@/lib/rate-limit";
import { rateLimitAsync } from "@/server/billing/rate-limit";
import { isLocked, registerFailure, registerSuccess } from "@/server/security/lockout";
import { setChallenge } from "@/server/security/challenge";

const Body = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
  /** storefront slug when a customer logs in to a shop; omitted for staff/owner/superadmin login */
  store: z.string().max(100).optional(),
});

/** One generic message for wrong password, unknown email and locked account (no account enumeration). */
const GENERIC_LOGIN_ERROR = "Invalid email or password, or the account is temporarily locked.";
// compared when no account matches so response time does not reveal whether the email exists
let dummy: Promise<string> | undefined;
const dummyCheck = async (pw: string) => verifyPassword(pw, await (dummy ??= hashPassword("not-a-real-password")));

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: GENERIC_LOGIN_ERROR }, { status: 400 });
  const { email, password, store } = parsed.data;
  const lower = email.toLowerCase();

  // throttles: per IP (spray) and per account name (stuffing). Shared store in multi-instance production.
  const ip = clientIp(req);
  if (!(await rateLimitAsync(`login:ip:${ip}`, 100, 10 * 60_000)) || !(await rateLimitAsync(`login:acct:${lower}`, 12, 15 * 60_000))) {
    return NextResponse.json({ error: "Too many sign-in attempts. Please wait a few minutes and try again." }, { status: 429, headers: { "retry-after": "300" } });
  }

  let candidates;
  if (store) {
    const tenant = await resolveTenant(store);
    if (!tenant) return NextResponse.json({ error: GENERIC_LOGIN_ERROR }, { status: 401 });
    candidates = await db.select().from(schema.users).where(and(eq(schema.users.tenantId, tenant.id), sql`lower(${schema.users.email}) = ${lower}`));
  } else {
    // staff/owner of any tenant or platform superadmin
    candidates = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${lower} and ${schema.users.role} <> 'customer'`);
    const sa = await db.select().from(schema.users).where(and(isNull(schema.users.tenantId), sql`lower(${schema.users.email}) = ${lower}`));
    candidates = [...sa, ...candidates.filter((c) => c.tenantId)];
  }

  const now = Date.now();
  let matched: (typeof candidates)[number] | null = null;
  const failed: typeof candidates = [];
  for (const u of candidates) {
    if (!u.active || isLocked(u, now)) { await dummyCheck(password); continue; } // locked: do not even try the password
    if (await verifyPassword(password, u.passwordHash)) { matched = u; break; }
    failed.push(u);
  }
  if (!candidates.length) await dummyCheck(password);

  if (!matched) {
    for (const u of failed) {
      const next = registerFailure({ failedLogins: u.failedLogins, lockedUntil: u.lockedUntil }, now);
      await db.update(schema.users).set({ failedLogins: next.failedLogins, lockedUntil: next.lockedUntil }).where(eq(schema.users.id, u.id));
      if (next.justLocked) await audit("security.account_locked", { userId: u.id, email: u.email, ip, minutes: 15 }, u.tenantId);
    }
    return NextResponse.json({ error: GENERIC_LOGIN_ERROR }, { status: 401 });
  }

  const u = matched;
  const redirect = u.role === "superadmin" ? "/superadmin" : u.role === "customer" ? null : "/admin";
  if (u.totpEnabledAt) {
    // password OK, second factor still needed: short-lived challenge cookie, no session yet
    await setChallenge(u.id);
    return NextResponse.json({ ok: true, twoFactor: true, redirect });
  }
  await db.update(schema.users).set({ ...registerSuccess(), lastLoginAt: new Date() }).where(eq(schema.users.id, u.id));
  await createSession({ uid: u.id, role: u.role, tid: u.tenantId });
  return NextResponse.json({ ok: true, role: u.role, redirect });
}
