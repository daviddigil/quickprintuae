import { test } from "node:test";
import assert from "node:assert/strict";
import { sha256Hex } from "./sigv4";

test("storage.ts with STORAGE_DRIVER=s3: confidential files are AES-GCM encrypted before upload and round-trip", async () => {
  Object.assign(process.env, { STORAGE_DRIVER: "s3", S3_ENDPOINT: "https://s3.test", S3_BUCKET: "b", S3_REGION: "us-east-1", S3_ACCESS_KEY_ID: "AK", S3_SECRET_ACCESS_KEY: "SK" });
  const bucket = new Map<string, Buffer>();
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const h = init.headers as Record<string, string>;
    assert.ok(h.authorization.startsWith("AWS4-HMAC-SHA256"));
    if (init.method === "PUT") { assert.equal(h["x-amz-content-sha256"], sha256Hex(Buffer.from(init.body as Uint8Array))); bucket.set(url, Buffer.from(init.body as Uint8Array)); return new Response(null); }
    if (init.method === "GET") return bucket.has(url) ? new Response(new Uint8Array(bucket.get(url)!)) : new Response("", { status: 404 });
    bucket.delete(url); return new Response(null, { status: 204 });
  }) as unknown as typeof fetch;
  try {
    const { putFile, getFile, deleteFile } = await import("./storage");
    const secret = Buffer.from("trade licence scan");
    const key = await putFile("tenant1", secret, ".pdf", true);
    assert.ok(key.endsWith(".enc"));
    const stored = [...bucket.values()][0];
    assert.ok(!stored.includes(secret), "ciphertext only in the bucket");
    assert.equal((await getFile(key, true)).toString(), "trade licence scan");
    const pub = await putFile("tenant1", Buffer.from("png"), ".png", false);
    assert.equal((await getFile(pub, false)).toString(), "png");
    await deleteFile(key);
    await assert.rejects(getFile(key, true));
    await assert.rejects(getFile("../etc/passwd", false));
  } finally { globalThis.fetch = real; delete process.env.STORAGE_DRIVER; }
});
