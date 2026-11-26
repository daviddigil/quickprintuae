import { connect as netConnect, type Socket } from "node:net";
import { connect as tlsConnect } from "node:tls";

/**
 * Fixed-window rate limiter with pluggable stores.
 *
 *  - `rateLimit(key, limit, windowMs): boolean`        SYNC, in-memory, per instance (kept for existing callers).
 *  - `rateLimitAsync(key, limit, windowMs): Promise<boolean>`  uses the shared store when configured:
 *        UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN  -> Upstash-style REST over fetch
 *        REDIS_URL (redis:// or rediss://)                 -> tiny built-in RESP client over node:net/tls (no dependency)
 *        otherwise                                         -> in-memory
 *    A shared store is REQUIRED when you run more than one app instance; otherwise limits (login, reset, signup)
 *    are per instance. If Redis is unreachable the limiter fails OPEN to memory and logs once (never blocks logins).
 */
export interface RateStore {
  /** increments the counter for `key`, (re)starting the window on first hit; returns the new count */
  hit(key: string, windowMs: number): Promise<number>;
}

/* ---------- in-memory ---------- */
const buckets = new Map<string, { n: number; reset: number }>();
export function memoryHit(key: string, windowMs: number, now = Date.now()): number {
  const b = buckets.get(key);
  if (!b || b.reset < now) { buckets.set(key, { n: 1, reset: now + windowMs }); if (buckets.size > 50_000) prune(now); return 1; }
  return ++b.n;
}
function prune(now: number) { for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k); }
export const resetMemoryRateLimits = () => buckets.clear();

export function rateLimit(key: string, limit: number, windowMs: number) {
  return memoryHit(key, windowMs) <= limit;
}

/* ---------- Upstash-style REST ---------- */
export function upstashStore(url: string, token: string, fetchImpl: typeof fetch = fetch): RateStore {
  return {
    async hit(key, windowMs) {
      const res = await fetchImpl(`${url.replace(/\/$/, "")}/pipeline`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify([["INCR", key], ["PEXPIRE", key, String(windowMs), "NX"]]),
      });
      if (!res.ok) throw new Error(`upstash ${res.status}`);
      const out = (await res.json()) as { result?: unknown }[];
      return Number(out[0]?.result);
    },
  };
}

/* ---------- minimal RESP client (REDIS_URL) ---------- */
export const encodeResp = (args: string[]) => `*${args.length}\r\n${args.map((a) => `$${Buffer.byteLength(a)}\r\n${a}\r\n`).join("")}`;
/** Parses one simple RESP reply (+OK, -ERR, :int, $bulk) from the front of `buf`; returns null if incomplete. */
export function parseResp(buf: string): { value: string | number | null; error?: string; rest: string } | null {
  const nl = buf.indexOf("\r\n");
  if (nl < 0) return null;
  const t = buf[0], line = buf.slice(1, nl), rest = buf.slice(nl + 2);
  if (t === "+") return { value: line, rest };
  if (t === "-") return { value: null, error: line, rest };
  if (t === ":") return { value: Number(line), rest };
  if (t === "$") {
    const len = Number(line);
    if (len < 0) return { value: null, rest };
    if (Buffer.byteLength(rest) < len + 2) return null;
    return { value: rest.slice(0, len), rest: rest.slice(len + 2) };
  }
  return { value: null, error: "unsupported reply", rest };
}

export function redisStore(redisUrl: string): RateStore {
  const u = new URL(redisUrl);
  const tls = u.protocol === "rediss:";
  const port = Number(u.port || 6379);
  const cmds = (key: string, windowMs: number) => {
    const c: string[][] = [];
    if (u.password) c.push(u.username && u.username !== "default" ? ["AUTH", decodeURIComponent(u.username), decodeURIComponent(u.password)] : ["AUTH", decodeURIComponent(u.password)]);
    if (u.pathname.length > 1) c.push(["SELECT", u.pathname.slice(1)]);
    c.push(["INCR", key], ["PEXPIRE", key, String(windowMs), "NX"]);
    return c;
  };
  return {
    hit(key, windowMs) {
      return new Promise<number>((resolve, reject) => {
        const list = cmds(key, windowMs);
        const sock: Socket = tls ? tlsConnect({ host: u.hostname, port, servername: u.hostname }) : netConnect({ host: u.hostname, port });
        let acc = "", got = 0, count = NaN;
        const done = (err?: Error) => { clearTimeout(timer); sock.destroy(); if (err) reject(err); else resolve(count); };
        const timer = setTimeout(() => done(new Error("redis timeout")), 1500);
        sock.setEncoding("utf8");
        sock.on("error", done);
        sock.on(tls ? "secureConnect" : "connect", () => sock.write(list.map(encodeResp).join("")));
        sock.on("data", (d: string) => {
          acc += d;
          for (;;) {
            const r = parseResp(acc);
            if (!r) return;
            acc = r.rest;
            if (r.error) return done(new Error(`redis: ${r.error}`));
            if (list[got][0] === "INCR") count = Number(r.value);
            if (++got === list.length) return done();
          }
        });
      });
    },
  };
}

/* ---------- store selection ---------- */
let override: RateStore | null | undefined;
/** tests: force a store (or null for memory) */
export const setRateStore = (s: RateStore | null) => { override = s; };
let selected: RateStore | null | undefined;
let warned = false;
function store(): RateStore | null {
  if (override !== undefined) return override;
  if (selected !== undefined) return selected;
  const rest = process.env.UPSTASH_REDIS_REST_URL, tok = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (rest && tok) selected = upstashStore(rest, tok);
  else if (process.env.REDIS_URL) selected = redisStore(process.env.REDIS_URL);
  else selected = null;
  return selected;
}
export const rateLimitBackend = () => (override ? "custom" : process.env.UPSTASH_REDIS_REST_URL ? "upstash" : process.env.REDIS_URL ? "redis" : "memory");

export async function rateLimitAsync(key: string, limit: number, windowMs: number): Promise<boolean> {
  const s = store();
  if (s) {
    try { return (await s.hit(`qp:rl:${key}`, windowMs)) <= limit; }
    catch (e) { if (!warned) { warned = true; console.error("[rate-limit] shared store unavailable, falling back to memory:", (e as Error).message); } }
  }
  return memoryHit(key, windowMs) <= limit;
}
