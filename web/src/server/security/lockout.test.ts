import { test } from "node:test";
import assert from "node:assert/strict";
import { isLocked, LOCKOUT_MS, MAX_FAILED_LOGINS, registerFailure, registerSuccess } from "./lockout";
import { superadminMustHave2FA } from "./policy";
import { hashResetToken, looksLikeResetToken, newResetToken, RESET_TTL_MS } from "./reset-token";

test("5 failures lock for 15 minutes, 4 do not", () => {
  let s = registerSuccess(); const t = 1_000_000;
  for (let i = 1; i < MAX_FAILED_LOGINS; i++) { const n = registerFailure(s, t); assert.equal(n.lockedUntil, null); s = n; }
  const n = registerFailure(s, t);
  assert.ok(n.justLocked && n.lockedUntil!.getTime() === t + LOCKOUT_MS && LOCKOUT_MS === 15 * 60_000);
  assert.ok(isLocked(n, t + 1000) && !isLocked(n, t + LOCKOUT_MS + 1));
});
test("an expired lock starts a fresh count; extra failures while locked do not extend it", () => {
  const t = 5_000_000;
  const locked = { failedLogins: 5, lockedUntil: new Date(t + 1000) };
  const again = registerFailure(locked, t + 500);
  assert.equal(again.lockedUntil!.getTime() <= t + 1000 + LOCKOUT_MS, true);
  const fresh = registerFailure(locked, t + 2000);
  assert.equal(fresh.failedLogins, 1); assert.equal(fresh.lockedUntil, null);
});
test("superadmin 2FA policy: only in production unless REQUIRE_SUPERADMIN_2FA=0", () => {
  assert.equal(superadminMustHave2FA({ NODE_ENV: "production" }), true);
  assert.equal(superadminMustHave2FA({ NODE_ENV: "production", REQUIRE_SUPERADMIN_2FA: "0" }), false);
  assert.equal(superadminMustHave2FA({ NODE_ENV: "development" }), false);
  assert.equal(superadminMustHave2FA({}), false);
});
test("reset tokens: 32 random bytes, hash only stored, 60 min expiry", () => {
  const a = newResetToken(1000), b = newResetToken(1000);
  assert.notEqual(a.token, b.token);
  assert.ok(looksLikeResetToken(a.token) && Buffer.from(a.token, "base64url").length === 32);
  assert.equal(a.tokenHash, hashResetToken(a.token));
  assert.notEqual(a.tokenHash, a.token);
  assert.equal(a.expiresAt.getTime(), 1000 + RESET_TTL_MS); assert.equal(RESET_TTL_MS, 3_600_000);
  assert.ok(!looksLikeResetToken("short") && !looksLikeResetToken(a.token + "x"));
});
