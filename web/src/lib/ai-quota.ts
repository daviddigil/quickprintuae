/** AI card-design quota rules (pure, unit tested). The atomic DB counter is src/server/ai/card-quota.ts. */

/** Calendar month in Asia/Dubai (UTC+4, no DST) as YYYY-MM: the counter resets on the 1st, Dubai time. */
export function quotaPeriod(now: Date = new Date()): string {
  const d = new Date(now.getTime() + 4 * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Shared networks (offices, mobile carriers) make IPs a weaker identity, so the per-IP ceiling is a multiple of the per-customer limit. */
export const IP_LIMIT_MULTIPLIER = 3;
export const ipLimit = (perCustomer: number) => Math.max(0, perCustomer) * IP_LIMIT_MULTIPLIER;

export interface QuotaView { used: number; limit: number; remaining: number; period: string }
export const quotaView = (used: number, limit: number, period: string): QuotaView => ({ used, limit, remaining: Math.max(0, limit - used), period });

export function quotaMessage(q: Pick<QuotaView, "limit">): string {
  return `You have used all ${q.limit} AI designs for this month. You can still pick a template or design your card yourself with the editor.`;
}
