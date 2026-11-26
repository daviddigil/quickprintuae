import "server-only";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { hashPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { sendEmail } from "@/server/email";
import { passwordResetEmail } from "@/server/email/templates";
import { hashResetToken, looksLikeResetToken, newResetToken, RESET_TTL_MS } from "./reset-token";
import { MIN_PASSWORD_LENGTH } from "./policy";

/** Creates a reset for a user, voiding any earlier unused ones. Returns the raw token (only its hash is stored). */
export async function createPasswordReset(userId: string, now = Date.now()) {
  await db.update(schema.passwordResets).set({ usedAt: new Date(now) }).where(and(eq(schema.passwordResets.userId, userId), isNull(schema.passwordResets.usedAt)));
  const t = newResetToken(now);
  await db.insert(schema.passwordResets).values({ userId, tokenHash: t.tokenHash, expiresAt: t.expiresAt });
  return t;
}

/** Sends reset emails to every matching account. Callers must NOT reveal whether anything was sent. */
export async function requestPasswordReset(email: string, storeSlug?: string | null) {
  const lower = email.trim().toLowerCase();
  let rows: (typeof schema.users.$inferSelect)[] = [];
  if (storeSlug) {
    const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, storeSlug) });
    if (tenant) rows = await db.select().from(schema.users).where(and(eq(schema.users.tenantId, tenant.id), sql`lower(${schema.users.email}) = ${lower}`));
  } else {
    rows = await db.select().from(schema.users).where(and(sql`lower(${schema.users.email}) = ${lower}`, sql`${schema.users.role} <> 'customer'`));
  }
  for (const u of rows.filter((r) => r.active).slice(0, 3)) {
    const { token } = await createPasswordReset(u.id);
    const url = `${env.appUrl.replace(/\/$/, "")}/reset-password/${token}`;
    const r = await sendEmail({ to: u.email, tag: "password.reset", ...passwordResetEmail({ name: u.name, url }) });
    await audit("security.password_reset_requested", { userId: u.id, emailOk: r.ok }, u.tenantId);
  }
}

export async function isResetTokenValid(token: string, now = Date.now()) {
  if (!looksLikeResetToken(token)) return false;
  const row = await db.query.passwordResets.findFirst({ where: and(eq(schema.passwordResets.tokenHash, hashResetToken(token)), isNull(schema.passwordResets.usedAt), gt(schema.passwordResets.expiresAt, new Date(now))) });
  return !!row;
}

export type ResetOutcome = { ok: true; userId: string } | { ok: false; reason: "invalid" | "weak" };

/**
 * Single use: the token is claimed atomically (UPDATE ... WHERE used_at IS NULL AND expires_at > now RETURNING),
 * so two concurrent submissions cannot both succeed. Also clears any lockout. 2FA is NOT disabled by a reset.
 * Changing the password hash invalidates all existing sessions (see passwordVersion in src/lib/auth.ts).
 */
export async function consumePasswordReset(token: string, newPassword: string, now = Date.now()): Promise<ResetOutcome> {
  if (!looksLikeResetToken(token)) return { ok: false, reason: "invalid" };
  if (newPassword.length < MIN_PASSWORD_LENGTH || newPassword.length > 128) return { ok: false, reason: "weak" };
  const [claimed] = await db.update(schema.passwordResets).set({ usedAt: new Date(now) })
    .where(and(eq(schema.passwordResets.tokenHash, hashResetToken(token)), isNull(schema.passwordResets.usedAt), gt(schema.passwordResets.expiresAt, new Date(now))))
    .returning({ userId: schema.passwordResets.userId });
  if (!claimed) return { ok: false, reason: "invalid" };
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, claimed.userId) });
  await db.update(schema.users).set({ passwordHash: await hashPassword(newPassword), failedLogins: 0, lockedUntil: null }).where(eq(schema.users.id, claimed.userId));
  await audit("security.password_reset_completed", { userId: claimed.userId }, user?.tenantId);
  return { ok: true, userId: claimed.userId };
}

export { RESET_TTL_MS };
