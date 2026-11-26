import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * RFC 4226 / RFC 6238 TOTP and one-time recovery codes. Pure functions (no DB, no cookies) so they are unit tested
 * against the RFC test vectors. Defaults match Google Authenticator / Authy / 1Password: SHA-1, 6 digits, 30 s.
 */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("Invalid base32");
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export type TotpAlgo = "sha1" | "sha256" | "sha512";
export interface TotpOpts { step?: number; digits?: number; algo?: TotpAlgo }

/** 160-bit random secret, base32 (what the authenticator app stores). */
export const generateTotpSecret = () => base32Encode(randomBytes(20));

export function hotp(key: Buffer, counter: number | bigint, digits = 6, algo: TotpAlgo = "sha1"): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac(algo, key).update(msg).digest();
  const o = h[h.length - 1] & 0x0f;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

/** The code valid at `timeMs` for a base32 secret. */
export function totpAt(secretB32: string, timeMs: number, o: TotpOpts = {}): string {
  const step = o.step ?? 30;
  return hotp(base32Decode(secretB32), Math.floor(timeMs / 1000 / step), o.digits ?? 6, o.algo ?? "sha1");
}
/** Same, but from a raw key (used by the RFC 6238 vectors, which give ASCII keys). */
export function totpFromKey(key: Buffer, timeMs: number, o: TotpOpts = {}): string {
  return hotp(key, Math.floor(timeMs / 1000 / (o.step ?? 30)), o.digits ?? 6, o.algo ?? "sha1");
}

const safeEq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Accepts the current code and `window` steps either side (clock drift). Constant-time compare. */
export function verifyTotp(secretB32: string, code: string, nowMs = Date.now(), window = 1, o: TotpOpts = {}): boolean {
  const c = String(code ?? "").replace(/\s/g, "");
  const digits = o.digits ?? 6;
  if (!new RegExp(`^\\d{${digits}}$`).test(c)) return false;
  const step = (o.step ?? 30) * 1000;
  let ok = false;
  for (let w = -window; w <= window; w++) if (safeEq(totpAt(secretB32, nowMs + w * step, o), c)) ok = true;
  return ok;
}

export function otpauthUri(opts: { secret: string; account: string; issuer?: string }): string {
  const issuer = opts.issuer ?? "QuickPrint UAE";
  const label = encodeURIComponent(`${issuer}:${opts.account}`);
  return `otpauth://totp/${label}?secret=${opts.secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/* ---------- recovery codes ---------- */
const RC_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const normaliseRecovery = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const hashRecoveryCode = (c: string) => createHash("sha256").update(`qp-recovery:${normaliseRecovery(c)}`).digest("hex");

/** `count` codes like "K7QD2-M9XPA" (10 chars, ~50 bits each). Show once; store only the hashes. */
export function generateRecoveryCodes(count = 10): { codes: string[]; hashes: string[] } {
  const codes = Array.from({ length: count }, () => {
    const b = randomBytes(10);
    const s = Array.from(b, (x) => RC_ALPHABET[x % RC_ALPHABET.length]).join("");
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
  return { codes, hashes: codes.map(hashRecoveryCode) };
}

/** If `input` matches a stored hash, returns the hashes with that one removed (single use); otherwise null. */
export function consumeRecoveryCode(stored: string[], input: string): string[] | null {
  if (normaliseRecovery(input).length !== 10) return null;
  const h = hashRecoveryCode(input);
  const i = stored.findIndex((s) => safeEq(s, h));
  return i < 0 ? null : stored.filter((_, j) => j !== i);
}
