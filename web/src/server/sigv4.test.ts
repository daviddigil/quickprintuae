import { test } from "node:test";
import assert from "node:assert/strict";
import { createS3 } from "./storage-s3";
import { sha256Hex, signRequest, signingKey } from "./sigv4";

const EMPTY = sha256Hex("");

test("signing key derivation (AWS docs example)", () => {
  assert.equal(signingKey("wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", "20120215", "us-east-1", "iam").toString("hex"), "f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d");
});
test("AWS sigv4 test suite: get-vanilla", () => {
  const r = signRequest({ method: "GET", url: "https://example.amazonaws.com/", payloadHash: EMPTY, region: "us-east-1", service: "service", accessKeyId: "AKIDEXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", date: new Date("2015-08-30T12:36:00Z") });
  assert.equal(r.signature, "5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31");
  assert.equal(r.authorization, "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31");
});
const S3 = { region: "us-east-1", service: "s3", accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", date: new Date("2013-05-24T00:00:00Z") };
test("AWS S3 docs example: GET object with Range", () => {
  const r = signRequest({ ...S3, method: "GET", url: "https://examplebucket.s3.amazonaws.com/test.txt", headers: { range: "bytes=0-9" }, payloadHash: EMPTY, includeContentSha: true });
  assert.equal(r.signature, "f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41");
});
test("AWS S3 docs example: PUT object (special char in key)", () => {
  const r = signRequest({ ...S3, method: "PUT", url: "https://examplebucket.s3.amazonaws.com/test$file.text", headers: { date: "Fri, 24 May 2013 00:00:00 GMT", "x-amz-storage-class": "REDUCED_REDUNDANCY" }, payloadHash: sha256Hex("Welcome to Amazon S3."), includeContentSha: true });
  assert.equal(r.signature, "98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd");
});
test("AWS S3 docs example: GET bucket lifecycle (query string)", () => {
  const r = signRequest({ ...S3, method: "GET", url: "https://examplebucket.s3.amazonaws.com/?lifecycle", payloadHash: EMPTY, includeContentSha: true });
  assert.equal(r.signature, "fea454ca298b7da1c68078a5d1bdbfbbe0d65c699e0f91ac7a200a0136783543");
});

test("S3 adapter: signed path-style requests with a mocked fetch", async () => {
  const store = new Map<string, Buffer>();
  const seen: { method: string; url: string; headers: Record<string, string> }[] = [];
  const mock = (async (url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    seen.push({ method: init.method!, url, headers });
    if (init.method === "PUT") { store.set(url, Buffer.from(init.body as Uint8Array)); return new Response(null, { status: 200 }); }
    if (init.method === "GET") { const b = store.get(url); return b ? new Response(new Uint8Array(b)) : new Response("nope", { status: 404 }); }
    store.delete(url); return new Response(null, { status: 204 });
  }) as unknown as typeof fetch;
  const s3 = createS3({ endpoint: "https://s3.example.com", bucket: "qp", region: "me-central-1", accessKeyId: "AK", secretAccessKey: "SK" }, mock);
  await s3.put("t1/2026-11/a b.pdf", Buffer.from("hello"), "application/pdf");
  assert.equal(seen[0].url, "https://s3.example.com/qp/t1/2026-11/a%20b.pdf");
  assert.match(seen[0].headers.authorization, /^AWS4-HMAC-SHA256 Credential=AK\/\d{8}\/me-central-1\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
  assert.equal(seen[0].headers["x-amz-content-sha256"], sha256Hex("hello"));
  assert.equal((await s3.get("t1/2026-11/a b.pdf")).toString(), "hello");
  await s3.delete("t1/2026-11/a b.pdf");
  await assert.rejects(s3.get("t1/2026-11/a b.pdf"));
  const v = createS3({ endpoint: "https://s3.example.com", bucket: "qp", region: "r", accessKeyId: "a", secretAccessKey: "b", addressing: "virtual" }, mock);
  assert.equal(v.objectUrl("x/y.png"), "https://qp.s3.example.com/x/y.png");
});
