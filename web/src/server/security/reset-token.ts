import { createHash, randomBytes } from "node:crypto";

/** Password reset tokens: 32 random bytes, URL-safe; only the SHA-256 hash is stored. */
export const RESET_TTL_MS = 60 * 60_000;
export const hashResetToken = (token: string) => createHash("sha256").update(token).digest("hex");
export function newResetToken(now = Date.now()) {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashResetToken(token), expiresAt: new Date(now + RESET_TTL_MS) };
}
export const looksLikeResetToken = (t: string) => /^[A-Za-z0-9_-]{43}$/.test(t);
