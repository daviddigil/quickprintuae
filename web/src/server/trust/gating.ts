import { fakeFlag as runtimeFake } from "@/lib/runtime";
import "server-only";
import type { Tenant } from "@/db/schema";

/** Simulated payments are on (tests, local demo). Same switch as src/server/payments/index.ts. */
export const paymentsFake = () => runtimeFake("PAYMENTS_FAKE");

export const NOT_OPEN_MESSAGE = "This store is not yet open for orders.";

/** The shop's own owner/staff (or an impersonating superadmin) is browsing. */
async function isShopStaffSession(tenantId: string): Promise<boolean> {
  try {
    // lazy: @/lib/auth pulls in next/navigation, which unit tests (no Next runtime) cannot load
    const { getSession } = await import("@/lib/auth");
    const s = await getSession();
    return !!s && s.tid === tenantId && (s.role === "owner" || s.role === "staff");
  } catch { return false; } // outside a request (tests, cron)
}

/**
 * Can this visitor place an order right now?
 * - verified shop with a running subscription/trial: yes (real payments)
 * - unverified shop: no live customer payments. Only its own owner/staff may place a TEST order, and only when simulated payments are on.
 * - 'incomplete' shop (no card yet): never.
 */
export async function orderingState(tenant: Pick<Tenant, "id" | "status" | "verificationStatus">): Promise<{ open: boolean; preview: boolean; reason: "incomplete" | "unverified" | null }> {
  if (tenant.status === "incomplete") return { open: false, preview: false, reason: "incomplete" };
  if (tenant.verificationStatus === "verified") return { open: true, preview: false, reason: null };
  if (paymentsFake() && await isShopStaffSession(tenant.id)) return { open: true, preview: true, reason: "unverified" };
  return { open: false, preview: await isShopStaffSession(tenant.id), reason: "unverified" };
}
