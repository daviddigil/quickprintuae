import { createHash, createHmac } from "node:crypto";

/**
 * AWS Signature Version 4 (header-based auth) with node:crypto only. Verified against the published AWS test vectors
 * (see sigv4.test.ts). Works for S3 and S3-compatible stores (R2, MinIO, Spaces, Wasabi, Hostinger/other object storage).
 */
export const sha256Hex = (d: string | Buffer | Uint8Array) => createHash("sha256").update(d).digest("hex");
const hmac = (k: string | Buffer, d: string) => createHmac("sha256", k).update(d).digest();
/** RFC 3986 encoding as AWS wants it (encodeURIComponent plus !'()*). */
export const awsEncode = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

export const amzDate = (d: Date) => d.toISOString().replace(/[:-]|\.\d{3}/g, "");

export function signingKey(secret: string, dateStamp: string, region: string, service: string) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, dateStamp), region), service), "aws4_request");
}

export interface SignInput {
  method: string;
  url: string;
  /** extra headers to send AND sign (e.g. range, x-amz-storage-class, content-type). host/x-amz-date are added if absent. */
  headers?: Record<string, string>;
  /** hex sha256 of the payload, or "UNSIGNED-PAYLOAD". Included as x-amz-content-sha256 when `includeContentSha` (S3). */
  payloadHash: string;
  includeContentSha?: boolean;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  date?: Date;
}

export function signRequest(i: SignInput) {
  const u = new URL(i.url);
  const now = i.date ?? new Date();
  const amz = amzDate(now);
  const dateStamp = amz.slice(0, 8);
  const h: Record<string, string> = {};
  for (const [k, v] of Object.entries(i.headers ?? {})) h[k.toLowerCase()] = String(v).trim().replace(/\s+/g, " ");
  h.host ??= u.host;
  h["x-amz-date"] ??= amz;
  if (i.includeContentSha) h["x-amz-content-sha256"] = i.payloadHash;
  if (i.sessionToken) h["x-amz-security-token"] = i.sessionToken;
  const names = Object.keys(h).sort();
  const canonicalHeaders = names.map((n) => `${n}:${h[n]}\n`).join("");
  const signedHeaders = names.join(";");
  // S3 style: each path segment encoded exactly once
  const canonicalUri = u.pathname.split("/").map((seg) => awsEncode(decodeURIComponent(seg))).join("/") || "/";
  const canonicalQuery = [...u.searchParams.entries()].map(([k, v]) => [awsEncode(k), awsEncode(v)] as const).sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join("&");
  const canonicalRequest = [i.method.toUpperCase(), canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, i.payloadHash].join("\n");
  const scope = `${dateStamp}/${i.region}/${i.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", h["x-amz-date"], scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(i.secretAccessKey, dateStamp, i.region, i.service)).update(stringToSign).digest("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${i.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { headers: { ...h, authorization } as Record<string, string>, authorization, signature, canonicalRequest, stringToSign };
}
