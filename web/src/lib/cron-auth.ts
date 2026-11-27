import { createHash, timingSafeEqual } from "node:crypto";
import { isRealProduction } from "./runtime";

/**
 * Authenticates cron/maintenance calls. Prefer `Authorization: Bearer <CRON_SECRET>` (or `x-cron-secret`).
 * The legacy `?secret=` query form (it ends up in access logs and proxies) is accepted ONLY outside real production.
 * Constant-time comparison; there is no default secret in real production (a missing/weak secret rejects everything).
 */
export function cronAuthorized(req: Request, expected: string | undefined = process.env.CRON_SECRET || (isRealProduction() ? undefined : "dev-cron")): boolean {
  if (!expected) return false;
  const h = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? req.headers.get("x-cron-secret");
  const q = isRealProduction() ? null : new URL(req.url).searchParams.get("secret");
  const given = h ?? q;
  if (!given) return false;
  const a = createHash("sha256").update(given).digest(), b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
