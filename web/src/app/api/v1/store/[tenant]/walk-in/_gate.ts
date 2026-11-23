import { NextResponse } from "next/server";
import type { Tenant } from "@/db/schema";
import { resolveTenant } from "@/lib/tenant";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { walkInGate } from "@/server/walk-in/customers";

/** Resolves the shop and enforces plan feature + shop switch. Returns a ready JSON error response otherwise. */
export async function gateRequest(rawTenant: string): Promise<{ tenant: Tenant } | { res: NextResponse }> {
  const tenant = await resolveTenant(rawTenant);
  if (!tenant || tenant.status === "suspended" || tenant.status === "cancelled") return { res: NextResponse.json({ error: "Store not found" }, { status: 404 }) };
  const g = await walkInGate(tenant);
  if (!g.ok) return { res: NextResponse.json({ error: "Walk-in printing isn't available at this shop.", reason: g.reason }, { status: 403 }) };
  return { tenant };
}

/** Per-IP (and optional extra key) limits. Returns a 429 response if exceeded. */
export function limited(req: Request, scope: string, ipLimit: number, windowMs: number, extra?: { key: string; limit: number }) {
  const checks = [rateLimit(`${scope}:ip:${clientIp(req)}`, ipLimit, windowMs)];
  if (extra) checks.push(rateLimit(`${scope}:${extra.key}`, extra.limit, windowMs));
  const bad = checks.find((c) => !c.ok);
  return bad ? NextResponse.json({ error: "Too many requests. Please wait a moment and try again." }, { status: 429, headers: { "retry-after": String(bad.retryAfterSec) } }) : null;
}
