import "server-only";
import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { env } from "@/lib/env";

/**
 * File storage. Local-disk implementation (mount a volume in Docker). Swap for S3/R2 by
 * implementing the same 3 functions. Confidential files are encrypted at rest (AES-256-GCM).
 */
const root = () => path.resolve(env.uploadDir);
const fileKey = () => createHash("sha256").update(`files:${env.encryptionKey}`).digest();

export async function putFile(tenantId: string, data: Buffer, ext: string, confidential: boolean) {
  const key = `${tenantId}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}${confidential ? ".enc" : ext}`;
  const full = path.join(root(), key);
  await mkdir(path.dirname(full), { recursive: true });
  if (confidential) {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", fileKey(), iv);
    const enc = Buffer.concat([c.update(data), c.final()]);
    await writeFile(full, Buffer.concat([iv, c.getAuthTag(), enc]));
  } else {
    await writeFile(full, data);
  }
  return key;
}

export async function getFile(key: string, confidential: boolean): Promise<Buffer> {
  const full = path.join(root(), key);
  if (!full.startsWith(root())) throw new Error("bad key");
  const buf = await readFile(full);
  if (!confidential) return buf;
  const d = createDecipheriv("aes-256-gcm", fileKey(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]);
}

export async function deleteFile(key: string) {
  const full = path.join(root(), key);
  if (!full.startsWith(root())) return;
  await unlink(full).catch(() => {});
}
