import "server-only";
import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { env } from "@/lib/env";
import { createS3, s3ConfigFromEnv } from "./storage-s3";

/**
 * File storage with two backends behind the same API (putFile / getFile / deleteFile):
 *   STORAGE_DRIVER=local (default)  local disk under UPLOAD_DIR (mount a persistent volume in Docker)
 *   STORAGE_DRIVER=s3               any S3-compatible bucket: S3_ENDPOINT, S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
 *                                   (optional S3_ADDRESSING=virtual). Requests are SigV4-signed with node:crypto, no SDK.
 * Confidential files are ALWAYS encrypted client-side with AES-256-GCM before they leave the server, whichever backend is used,
 * so the bucket never holds plaintext of those files. Keys look the same in both backends (tenant/yyyy-mm/uuid[.enc]).
 */
const root = () => path.resolve(env.uploadDir);
const fileKey = () => createHash("sha256").update(`files:${env.encryptionKey}`).digest();

const s3 = () => {
  if (process.env.STORAGE_DRIVER !== "s3") return null;
  const cfg = s3ConfigFromEnv();
  if (!cfg) throw new Error("STORAGE_DRIVER=s3 needs S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY");
  return createS3(cfg);
};

const MIME: Record<string, string> = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml" };

export async function putFile(tenantId: string, data: Buffer, ext: string, confidential: boolean) {
  const key = `${tenantId}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}${confidential ? ".enc" : ext}`;
  let body = data;
  if (confidential) {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", fileKey(), iv);
    const enc = Buffer.concat([c.update(data), c.final()]);
    body = Buffer.concat([iv, c.getAuthTag(), enc]);
  }
  const remote = s3();
  if (remote) { await remote.put(key, body, confidential ? "application/octet-stream" : MIME[ext.toLowerCase()]); return key; }
  const full = path.join(root(), key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, body);
  return key;
}

export async function getFile(key: string, confidential: boolean): Promise<Buffer> {
  const remote = s3();
  let buf: Buffer;
  if (remote) {
    if (key.includes("..") || key.startsWith("/")) throw new Error("bad key");
    buf = await remote.get(key);
  } else {
    const full = path.join(root(), key);
    if (!full.startsWith(root())) throw new Error("bad key");
    buf = await readFile(full);
  }
  if (!confidential) return buf;
  const d = createDecipheriv("aes-256-gcm", fileKey(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]);
}

export async function deleteFile(key: string) {
  const remote = s3();
  if (remote) { if (!key.includes("..") && !key.startsWith("/")) await remote.delete(key).catch(() => {}); return; }
  const full = path.join(root(), key);
  if (!full.startsWith(root())) return;
  await unlink(full).catch(() => {});
}
