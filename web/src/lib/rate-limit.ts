/**
 * In-memory sliding-window rate limiter (per server process). Good enough to blunt abuse of public endpoints;
 * swap for Redis when running multiple instances.
 */
const buckets = new Map<string, number[]>();
let lastPrune = 0;

export interface RateResult { ok: boolean; retryAfterSec: number; remaining: number }

/** Records a hit for `key` and reports whether it is within `limit` hits per `windowMs`. */
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateResult {
  if (now - lastPrune > 60_000) { // opportunistic cleanup so the map can't grow forever
    lastPrune = now;
    for (const [k, v] of buckets) if (!v.length || now - v[v.length - 1] > 3_600_000) buckets.delete(k);
  }
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000)), remaining: 0 };
  }
  hits.push(now);
  buckets.set(key, hits);
  return { ok: true, retryAfterSec: 0, remaining: limit - hits.length };
}

export const resetRateLimits = () => buckets.clear();

export function clientIp(req: Request) {
  const h = req.headers;
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}
