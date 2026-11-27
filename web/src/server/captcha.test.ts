import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyTurnstile } from "./captcha";

const reply = (body: unknown, ok = true) => (async () => ({ ok, json: async () => body }) as Response) as unknown as typeof fetch;

test("skipped when no secret is configured", async () => {
  const saved = process.env.TURNSTILE_SECRET_KEY; delete process.env.TURNSTILE_SECRET_KEY;
  try { assert.deepEqual(await verifyTurnstile(undefined), { ok: true, skipped: true }); } finally { if (saved) process.env.TURNSTILE_SECRET_KEY = saved; }
});

test("success, failure, missing token, http error", async () => {
  let seen: { url: string; body: string } | null = null;
  const spy = (async (url: string, init: RequestInit) => { seen = { url, body: String(init.body) }; return { ok: true, json: async () => ({ success: true }) } as Response; }) as unknown as typeof fetch;
  assert.deepEqual(await verifyTurnstile("tok", "1.2.3.4", { secret: "s", fetchImpl: spy }), { ok: true });
  assert.equal(seen!.url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
  assert.match(seen!.body, /secret=s/); assert.match(seen!.body, /response=tok/); assert.match(seen!.body, /remoteip=1.2.3.4/);
  assert.equal((await verifyTurnstile("tok", null, { secret: "s", fetchImpl: reply({ success: false }) })).ok, false);
  assert.equal((await verifyTurnstile(undefined, null, { secret: "s", fetchImpl: reply({ success: true }) })).ok, false);
  assert.equal((await verifyTurnstile("tok", null, { secret: "s", fetchImpl: reply({ success: true }, false) })).ok, false);
});

test("timeout and network errors fail closed when configured", async () => {
  const hang = ((_u: string, init: RequestInit) => new Promise((_, rej) => init.signal!.addEventListener("abort", () => rej(new Error("aborted"))))) as unknown as typeof fetch;
  const t0 = Date.now();
  const r = await verifyTurnstile("tok", null, { secret: "s", fetchImpl: hang, timeoutMs: 100 });
  assert.equal(r.ok, false); assert.ok(Date.now() - t0 < 2000);
  const boom = (async () => { throw new Error("down"); }) as unknown as typeof fetch;
  assert.equal((await verifyTurnstile("tok", null, { secret: "s", fetchImpl: boom })).ok, false);
});
