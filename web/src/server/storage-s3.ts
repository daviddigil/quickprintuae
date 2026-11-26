import { awsEncode, sha256Hex, signRequest } from "./sigv4";

export interface S3Config {
  endpoint: string; bucket: string; region: string; accessKeyId: string; secretAccessKey: string;
  /** "path" (default, works everywhere incl. MinIO) or "virtual" (bucket.host) */
  addressing?: "path" | "virtual";
}

export const s3ConfigFromEnv = (e: NodeJS.ProcessEnv = process.env): S3Config | null => {
  const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = e;
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) return null;
  return { endpoint: S3_ENDPOINT, bucket: S3_BUCKET, region: e.S3_REGION || "us-east-1", accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY, addressing: e.S3_ADDRESSING === "virtual" ? "virtual" : "path" };
};

/** Minimal S3 client: put / get / delete object, signed with SigV4. `fetchImpl` is injectable for tests. */
export function createS3(cfg: S3Config, fetchImpl: typeof fetch = fetch) {
  const objectUrl = (key: string) => {
    const base = new URL(cfg.endpoint);
    const path = key.split("/").map(awsEncode).join("/");
    if (cfg.addressing === "virtual") return `${base.protocol}//${cfg.bucket}.${base.host}/${path}`;
    return `${base.protocol}//${base.host}${base.pathname.replace(/\/$/, "")}/${cfg.bucket}/${path}`;
  };
  async function call(method: "PUT" | "GET" | "DELETE", key: string, body?: Buffer, contentType?: string) {
    const url = objectUrl(key);
    const signed = signRequest({
      method, url, region: cfg.region, service: "s3", accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey,
      payloadHash: sha256Hex(body ?? ""), includeContentSha: true, headers: contentType ? { "content-type": contentType } : {},
    });
    const { host: _host, ...headers } = signed.headers; // fetch sets Host itself
    void _host;
    return fetchImpl(url, { method, headers, body: body ? new Uint8Array(body) : undefined, signal: AbortSignal.timeout(30_000) });
  }
  return {
    objectUrl,
    async put(key: string, data: Buffer, contentType = "application/octet-stream") {
      const r = await call("PUT", key, data, contentType);
      if (!r.ok) throw new Error(`S3 PUT failed: ${r.status}`);
    },
    async get(key: string): Promise<Buffer> {
      const r = await call("GET", key);
      if (!r.ok) throw new Error(`S3 GET failed: ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    },
    async delete(key: string) {
      const r = await call("DELETE", key);
      if (!r.ok && r.status !== 404) throw new Error(`S3 DELETE failed: ${r.status}`);
    },
  };
}
