import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { storePath } from "@/lib/tenant";
import { hasFeature } from "@/server/billing";
import { AdminNav } from "@/components/admin/AdminNav";
import { PoweredBy } from "@/components/PoweredBy";

export const metadata = { title: { default: "Admin", template: "%s · Admin" } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { tenant, user, session } = await requireStaff();
  const plan = tenant.planId ? await db.query.plans.findFirst({ where: eq(schema.plans.id, tenant.planId) }) : null;
  const walkIn = await hasFeature(tenant, "walk_in_queue");
  const trialDays = tenant.trialEndsAt ? Math.ceil((tenant.trialEndsAt.getTime() - Date.now()) / 86400_000) : null;
  const planLine = `${plan?.name ?? "No plan"} · ${tenant.status === "trial" && trialDays !== null ? (trialDays > 0 ? `trial, ${trialDays} days left` : "trial expired") : tenant.status.replace("_", " ")}`;
  return (
    <div className="min-h-screen bg-surface-low" style={{ ["--store" as string]: tenant.primaryColor }}>
      {session.imp && (
        <div className="flex flex-wrap items-center justify-center gap-3 bg-warning px-4 py-2 text-sm font-medium text-on-warning-container print:hidden">
          Impersonating {user.name} ({user.email}) at {tenant.name}. Actions are audit-logged.
          <a href="/api/v1/superadmin/impersonate/stop" className="rounded bg-inverse-surface px-3 py-1 text-xs font-semibold text-white">Return to superadmin</a>
        </div>
      )}
      {(tenant.status === "past_due" || (tenant.status === "trial" && trialDays !== null && trialDays <= 3)) && (
        <div className="bg-critical px-4 py-2 text-center text-sm text-white print:hidden">
          {tenant.status === "past_due" ? "Your subscription payment is overdue." : `Your trial ends in ${Math.max(0, trialDays!)} day(s).`}{" "}
          <a className="font-semibold underline" href="/admin/billing">Go to billing</a>
        </div>
      )}
      <div className="lg:flex">
        <AdminNav shopName={tenant.name} storeUrl={storePath(tenant.slug)} isOwner={user.role === "owner"} userName={user.name} planLine={planLine} walkIn={walkIn} />
        <div className="flex min-w-0 flex-1 flex-col"><main className="flex-1 p-4 sm:p-6 lg:p-8 print:p-0">{children}</main><PoweredBy className="pb-4 text-center print:hidden" /></div>
      </div>
    </div>
  );
}
