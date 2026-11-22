import { createHmac, timingSafeEqual } from "crypto";

/** Verify Meta's X-Hub-Signature-256 ("sha256=<hex>") over the RAW request body. */
export function verifySignature(rawBody: string | Buffer, header: string | null | undefined, appSecret: string | undefined): boolean {
  if (!appSecret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  let given: Buffer;
  try { given = Buffer.from(header.slice(7), "hex"); } catch { return false; }
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export const signBody = (rawBody: string, appSecret: string) => "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");
