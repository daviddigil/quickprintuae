import { getSession } from "@/lib/auth";

/** Drop into any tenant-side layout (e.g. /admin). Renders only while a superadmin is impersonating. */
export async function ImpersonationBanner({ tenantName }: { tenantName?: string }) {
  const s = await getSession();
  if (!s?.imp) return null;
  return (
    <div className="flex items-center justify-center gap-3 bg-warning px-4 py-2 text-sm font-medium text-on-warning-container">
      <span>⚠ Impersonation mode{tenantName ? ` — you are acting as ${tenantName}` : ""}. Actions are audit-logged.</span>
      <a href="/api/v1/superadmin/impersonate/stop" className="rounded bg-amber-950 px-3 py-1 text-xs font-semibold text-amber-50 hover:bg-black">
        Exit impersonation
      </a>
    </div>
  );
}
