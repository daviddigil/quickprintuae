import { rateLimitAsync } from "@/server/billing/rate-limit";

export const UPLOAD_LIMITS = {
  perWindow: 30, windowMs: 10 * 60_000,
  perDay: 200, dayMs: 24 * 3600_000,
  /** bytes per visitor (IP + shop) per day */
  dailyBytes: 300 * 1024 * 1024,
};

export type LimitResult = { ok: true } | { ok: false; status: 429; error: string };

/**
 * Upload throttling per IP + shop: 30 uploads / 10 min, 200 / day (shared Redis when configured, else per instance).
 * The byte quota (300 MB / day) reuses the same counter: every started MB of an upload is one hit on a daily bucket of 300.
 * Rejected attempts also count (a refused upload still cost us a body read).
 */
export async function checkUploadLimits(ip: string, tenantId: string, bytes: number, limits = UPLOAD_LIMITS): Promise<LimitResult> {
  const k = `upl:${tenantId}:${ip}`;
  if (!(await rateLimitAsync(`${k}:w`, limits.perWindow, limits.windowMs))) return { ok: false, status: 429, error: "Too many uploads. Please wait a few minutes and try again." };
  if (!(await rateLimitAsync(`${k}:d`, limits.perDay, limits.dayMs))) return { ok: false, status: 429, error: "Daily upload limit reached for this store. Please try again tomorrow." };
  const mb = Math.max(1, Math.ceil(bytes / (1024 * 1024)));
  const cap = Math.floor(limits.dailyBytes / (1024 * 1024));
  // each MB is one hit on a daily counter; the upload is refused when this one would push the total over the cap
  let last = 0;
  for (let i = 0; i < mb; i++) { const ok = await rateLimitAsync(`${k}:b`, cap, limits.dayMs); if (!ok) { last = -1; break; } last++; }
  if (last < 0) return { ok: false, status: 429, error: "You have reached today's upload size limit for this store. Please try again tomorrow." };
  return { ok: true };
}
