import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { encodeResp, memoryHit, parseResp, rateLimit, rateLimitAsync, redisStore, resetMemoryRateLimits, setRateStore, upstashStore } from "./rate-limit";

beforeEach(() => { resetMemoryRateLimits(); setRateStore(null); });

test("sync rateLimit keeps its boolean contract", () => {
  assert.equal(rateLimit("a", 2, 1000), true); assert.equal(rateLimit("a", 2, 1000), true); assert.equal(rateLimit("a", 2, 1000), false);
  assert.equal(rateLimit("b", 2, 1000), true);
});
test("memory window resets", () => {
  assert.equal(memoryHit("w", 100, 1000), 1); assert.equal(memoryHit("w", 100, 1050), 2); assert.equal(memoryHit("w", 100, 1200), 1);
});
test("rateLimitAsync uses the injected store and fails open to memory on error", async () => {
  let n = 0;
  setRateStore({ hit: async () => ++n });
  assert.equal(await rateLimitAsync("x", 2, 1000), true); assert.equal(await rateLimitAsync("x", 2, 1000), true); assert.equal(await rateLimitAsync("x", 2, 1000), false);
  setRateStore({ hit: async () => { throw new Error("down"); } });
  const orig = console.error; console.error = () => {};
  try { assert.equal(await rateLimitAsync("y", 1, 1000), true); assert.equal(await rateLimitAsync("y", 1, 1000), false); } finally { console.error = orig; }
});
test("Upstash REST adapter sends an INCR+PEXPIRE pipeline with the bearer token", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const store = upstashStore("https://eu1.upstash.io/", "tok", (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify([{ result: 3 }, { result: 1 }])); }) as unknown as typeof fetch);
  assert.equal(await store.hit("k", 60000), 3);
  assert.equal(calls[0].url, "https://eu1.upstash.io/pipeline");
  assert.equal((calls[0].init.headers as Record<string, string>).authorization, "Bearer tok");
  assert.deepEqual(JSON.parse(calls[0].init.body as string), [["INCR", "k"], ["PEXPIRE", "k", "60000", "NX"]]);
  const bad = upstashStore("https://x", "t", (async () => new Response("no", { status: 500 })) as unknown as typeof fetch);
  await assert.rejects(bad.hit("k", 1));
});
test("RESP encode/parse", () => {
  assert.equal(encodeResp(["INCR", "k"]), "*2\r\n$4\r\nINCR\r\n$1\r\nk\r\n");
  assert.deepEqual(parseResp(":42\r\n+OK\r\n"), { value: 42, rest: "+OK\r\n" });
  assert.equal(parseResp(":4"), null);
  assert.equal(parseResp("-ERR bad\r\n")!.error, "ERR bad");
});
test("redis adapter talks RESP to a (fake) server, with AUTH", async () => {
  const seen: string[] = [];
  const srv = createServer((sock) => {
    sock.setEncoding("utf8");
    let buf = "";
    sock.on("data", (d: string) => {
      buf += d; seen.push(d);
      // reply per command once all 3 are in
      if ((buf.match(/\*\d+\r\n/g) ?? []).length >= 3) sock.write("+OK\r\n:7\r\n:1\r\n");
    });
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const port = (srv.address() as { port: number }).port;
  try {
    assert.equal(await redisStore(`redis://:s3cret@127.0.0.1:${port}`).hit("qp:k", 5000), 7);
    assert.match(seen.join(""), /AUTH\r\n\$6\r\ns3cret\r\n/);
    assert.match(seen.join(""), /INCR\r\n\$4\r\nqp:k\r\n/);
  } finally { srv.close(); }
});
