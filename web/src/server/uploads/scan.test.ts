import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { clamdScan, instreamFrames, parseClamReply, scanUpload } from "./scan";

test("INSTREAM framing: command, length-prefixed chunks, zero terminator", () => {
  const f = instreamFrames(Buffer.from("abcdefghij"), 4);
  assert.equal(f[0].toString(), "zINSTREAM\0");
  assert.equal(f[1].readUInt32BE(0), 4); assert.equal(f[2].toString(), "abcd");
  assert.equal(f[3].readUInt32BE(0), 4); assert.equal(f[4].toString(), "efgh");
  assert.equal(f[5].readUInt32BE(0), 2); assert.equal(f[6].toString(), "ij");
  assert.equal(f[7].readUInt32BE(0), 0);
  assert.equal(f.length, 8);
});

test("reply parsing", () => {
  assert.deepEqual(parseClamReply("stream: OK\0"), { ok: true });
  assert.deepEqual(parseClamReply("stream: Eicar-Test-Signature FOUND\0"), { ok: false, reason: "Malware detected (Eicar-Test-Signature)" });
  assert.equal(parseClamReply("INSTREAM size limit exceeded. ERROR").ok, false);
});

function fakeClam(reply: (data: Buffer) => string | null) {
  return new Promise<{ port: number; got: Buffer[]; close: () => void }>((resolve) => {
    const got: Buffer[] = [];
    const srv = createServer((sock) => {
      const chunks: Buffer[] = [];
      sock.on("data", (d) => {
        chunks.push(d);
        const all = Buffer.concat(chunks);
        if (all.subarray(-4).equals(Buffer.alloc(4))) { got.push(all); const r = reply(all); if (r !== null) sock.end(r + "\0"); }
      });
    }).listen(0, "127.0.0.1", () => resolve({ port: (srv.address() as AddressInfo).port, got, close: () => srv.close() }));
  });
}

test("clamdScan speaks INSTREAM to a fake clamd (clean and infected)", async () => {
  const body = Buffer.from("hello world");
  const clean = await fakeClam(() => "stream: OK");
  const r = await clamdScan(body, "127.0.0.1", clean.port, 2000);
  assert.deepEqual(r, { ok: true });
  const sent = clean.got[0];
  assert.equal(sent.subarray(0, 10).toString(), "zINSTREAM\0");
  assert.equal(sent.readUInt32BE(10), body.length);
  assert.equal(sent.subarray(14, 14 + body.length).toString(), "hello world");
  clean.close();
  const bad = await fakeClam(() => "stream: Win.Test.EICAR_HDB-1 FOUND");
  assert.deepEqual(await clamdScan(body, "127.0.0.1", bad.port, 2000), { ok: false, reason: "Malware detected (Win.Test.EICAR_HDB-1)" });
  bad.close();
});

test("scanUpload: no-op without env, fail-open on outage, fail-closed with CLAMAV_REQUIRED=1, timeout", async () => {
  const saved = { h: process.env.CLAMAV_HOST, p: process.env.CLAMAV_PORT, r: process.env.CLAMAV_REQUIRED };
  try {
    delete process.env.CLAMAV_HOST;
    assert.deepEqual(await scanUpload(Buffer.from("x")), { ok: true });
    const dead = await fakeClam(() => "stream: OK"); const port = dead.port; dead.close();
    process.env.CLAMAV_HOST = "127.0.0.1"; process.env.CLAMAV_PORT = String(port);
    const origErr = console.error; console.error = () => {};
    try { assert.deepEqual(await scanUpload(Buffer.from("x")), { ok: true }); } finally { console.error = origErr; }
    process.env.CLAMAV_REQUIRED = "1";
    assert.equal((await scanUpload(Buffer.from("x"))).ok, false);
    const hang = await fakeClam(() => null);
    await assert.rejects(clamdScan(Buffer.from("x"), "127.0.0.1", hang.port, 150), /timeout/);
    hang.close();
  } finally {
    for (const [k, v] of [["CLAMAV_HOST", saved.h], ["CLAMAV_PORT", saved.p], ["CLAMAV_REQUIRED", saved.r]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});
