import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { env } from "./env";

/** AES-256-GCM for tenant API secrets stored in the DB (payment & courier keys). */
const key = () => createHash("sha256").update(env.encryptionKey).digest();

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}

export function decrypt(payload: string | undefined | null): string | undefined {
  if (!payload) return undefined;
  const [v, iv, tag, data] = payload.split(":");
  if (v !== "v1") throw new Error("Unknown cipher version");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

/** mask for display in admin: sk_live_…abcd */
export const mask = (s?: string) => (s ? `${s.slice(0, 7)}…${s.slice(-4)}` : "");
