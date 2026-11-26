import { test } from "node:test";
import assert from "node:assert/strict";
import { base32Decode, base32Encode, consumeRecoveryCode, generateRecoveryCodes, generateTotpSecret, otpauthUri, totpAt, totpFromKey, verifyTotp } from "./totp";

// RFC 6238 Appendix B (8 digits)
const K1 = Buffer.from("12345678901234567890");
const K256 = Buffer.from("12345678901234567890123456789012");
const K512 = Buffer.from("1234567890123456789012345678901234567890123456789012345678901234");
const VEC: [number, string, string, string][] = [
  [59, "94287082", "46119246", "90693936"],
  [1111111109, "07081804", "68084774", "25091201"],
  [1111111111, "14050471", "67062674", "99943326"],
  [1234567890, "89005924", "91819424", "93441116"],
  [2000000000, "69279037", "90698825", "38618901"],
  [20000000000, "65353130", "77737706", "47863826"],
];
test("RFC 6238 test vectors (SHA-1, SHA-256, SHA-512)", () => {
  for (const [t, a, b, c] of VEC) {
    assert.equal(totpFromKey(K1, t * 1000, { digits: 8, algo: "sha1" }), a, `sha1 @${t}`);
    assert.equal(totpFromKey(K256, t * 1000, { digits: 8, algo: "sha256" }), b, `sha256 @${t}`);
    assert.equal(totpFromKey(K512, t * 1000, { digits: 8, algo: "sha512" }), c, `sha512 @${t}`);
  }
});
test("base32 round trip and RFC 4648 vector", () => {
  assert.equal(base32Encode(Buffer.from("foobar")), "MZXW6YTBOI");
  assert.equal(base32Decode("MZXW6YTBOI").toString(), "foobar");
  const s = generateTotpSecret();
  assert.equal(s.length, 32);
  assert.equal(base32Encode(base32Decode(s)), s);
});
test("verifyTotp accepts +-1 step, rejects further drift, junk and replayed formats", () => {
  const s = generateTotpSecret(), now = 1_700_000_000_000;
  const code = totpAt(s, now);
  assert.ok(verifyTotp(s, code, now));
  assert.ok(verifyTotp(s, totpAt(s, now - 30_000), now));
  assert.ok(verifyTotp(s, totpAt(s, now + 30_000), now));
  assert.ok(!verifyTotp(s, totpAt(s, now - 90_000), now));
  assert.ok(verifyTotp(s, `${code.slice(0, 3)} ${code.slice(3)}`, now), "spaces tolerated");
  assert.ok(!verifyTotp(s, "abcdef", now));
  assert.ok(!verifyTotp(s, "", now));
});
test("otpauth URI", () => {
  const u = otpauthUri({ secret: "ABC", account: "a@b.ae" });
  assert.match(u, /^otpauth:\/\/totp\/QuickPrint%20UAE%3Aa%40b\.ae\?secret=ABC&issuer=QuickPrint%20UAE/);
});
test("recovery codes: 10 unique, hashed, single use, format-insensitive", () => {
  const { codes, hashes } = generateRecoveryCodes(10);
  assert.equal(new Set(codes).size, 10);
  assert.ok(codes.every((c) => /^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(c)));
  assert.ok(hashes.every((h) => /^[0-9a-f]{64}$/.test(h)) && !hashes.includes(codes[0]));
  const left = consumeRecoveryCode(hashes, codes[3].toLowerCase().replace("-", " "));
  assert.ok(left && left.length === 9);
  assert.equal(consumeRecoveryCode(left!, codes[3]), null, "cannot be reused");
  assert.equal(consumeRecoveryCode(hashes, "AAAAA-AAAAA"), null);
  assert.equal(consumeRecoveryCode(hashes, "123456"), null);
});
