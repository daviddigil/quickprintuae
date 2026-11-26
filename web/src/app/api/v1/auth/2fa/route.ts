import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/rate-limit";
import { rateLimitAsync } from "@/server/billing/rate-limit";
import { isLocked, registerFailure, registerSuccess } from "@/server/security/lockout";
import { clearChallenge, readChallenge } from "@/server/security/challenge";
import { verifySecondFactor } from "@/server/security/twofactor";

const Body = z.object({ code: z.string().min(6).max(32) });

/** Second step of login: authenticator code or one-time recovery code. Failures count toward the account lockout. */
export async function POST(req: Request) {
  const uid = await readChallenge();
  if (!uid) return NextResponse.json({ error: "Your sign-in expired. Enter your email and password again.", expired: true }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });
  const ip = clientIp(req);
  if (!(await rateLimitAsync(`2fa:ip:${ip}`, 30, 10 * 60_000)) || !(await rateLimitAsync(`2fa:user:${uid}`, 10, 10 * 60_000))) {
    return NextResponse.json({ error: "Too many attempts. Please wait a few minutes." }, { status: 429 });
  }
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, uid) });
  if (!user || !user.active || isLocked(user)) return NextResponse.json({ error: "Invalid code, or the account is temporarily locked." }, { status: 401 });

  const how = await verifySecondFactor(user, parsed.data.code);
  if (!how) {
    const next = registerFailure({ failedLogins: user.failedLogins, lockedUntil: user.lockedUntil });
    await db.update(schema.users).set({ failedLogins: next.failedLogins, lockedUntil: next.lockedUntil }).where(eq(schema.users.id, user.id));
    if (next.justLocked) { await audit("security.account_locked", { userId: user.id, email: user.email, ip, via: "2fa" }, user.tenantId); await clearChallenge(); }
    return NextResponse.json({ error: "Invalid code, or the account is temporarily locked." }, { status: 401 });
  }
  await clearChallenge();
  await db.update(schema.users).set({ ...registerSuccess(), lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));
  await createSession({ uid: user.id, role: user.role, tid: user.tenantId });
  return NextResponse.json({ ok: true, role: user.role, usedRecoveryCode: how === "recovery", redirect: user.role === "superadmin" ? "/superadmin" : user.role === "customer" ? null : "/admin" });
}
