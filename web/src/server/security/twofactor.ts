import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { consumeRecoveryCode, generateRecoveryCodes, generateTotpSecret, otpauthUri, verifyTotp } from "./totp";

type User = typeof schema.users.$inferSelect;

/** Creates (or re-uses the still-pending) secret for enrolment. Not active until confirmEnrolment() succeeds. */
export async function startEnrolment(user: User) {
  let secret = !user.totpEnabledAt && user.totpSecretEnc ? decrypt(user.totpSecretEnc) : undefined;
  if (!secret) {
    secret = generateTotpSecret();
    await db.update(schema.users).set({ totpSecretEnc: encrypt(secret), totpEnabledAt: null }).where(eq(schema.users.id, user.id));
  }
  return { secret, uri: otpauthUri({ secret, account: user.email }) };
}

/** Verifies the first code, turns 2FA on and returns the recovery codes ONCE (only hashes are stored). */
export async function confirmEnrolment(user: User, code: string): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false }> {
  if (user.totpEnabledAt || !user.totpSecretEnc) return { ok: false };
  const secret = decrypt(user.totpSecretEnc);
  if (!secret || !verifyTotp(secret, code)) return { ok: false };
  const { codes, hashes } = generateRecoveryCodes(10);
  await db.update(schema.users).set({ totpEnabledAt: new Date(), recoveryCodesHash: hashes }).where(eq(schema.users.id, user.id));
  await audit("security.2fa_enabled", { userId: user.id }, user.tenantId);
  return { ok: true, recoveryCodes: codes };
}

export async function regenerateRecoveryCodes(user: User) {
  const { codes, hashes } = generateRecoveryCodes(10);
  await db.update(schema.users).set({ recoveryCodesHash: hashes }).where(eq(schema.users.id, user.id));
  await audit("security.recovery_codes_regenerated", { userId: user.id }, user.tenantId);
  return codes;
}

export async function disableTwoFactor(user: User) {
  await db.update(schema.users).set({ totpSecretEnc: null, totpEnabledAt: null, recoveryCodesHash: [] }).where(eq(schema.users.id, user.id));
  await audit("security.2fa_disabled", { userId: user.id }, user.tenantId);
}

/** Checks a TOTP code or a recovery code (which is consumed). Returns which one matched. */
export async function verifySecondFactor(user: User, input: string): Promise<"totp" | "recovery" | null> {
  if (!user.totpEnabledAt || !user.totpSecretEnc) return null;
  const secret = decrypt(user.totpSecretEnc);
  if (secret && verifyTotp(secret, input)) return "totp";
  const left = consumeRecoveryCode(user.recoveryCodesHash ?? [], input);
  if (left) {
    await db.update(schema.users).set({ recoveryCodesHash: left }).where(eq(schema.users.id, user.id));
    await audit("security.recovery_code_used", { userId: user.id, remaining: left.length }, user.tenantId);
    return "recovery";
  }
  return null;
}
