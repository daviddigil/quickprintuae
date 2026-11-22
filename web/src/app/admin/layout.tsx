import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { storePath } from "@/lib/tenant";
import { AdminNav } from "@/components/admin/AdminNav";

export const metadata = { title: { default: "Admin", template: "%s · Admin" } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { tenant, user, session } = await requireStaff();
  const plan = tenant.planId ? await db.query.plans.findFirst({ where: eq(schema.plans.id, tenant.planId) }) : null;
  const trialDays = tenant.trialEndsAt ? Math.ceil((tenant.trialEndsAt.getTime() - Date.now()) / 86400_000) : null;
  const planLine = `${plan?.name ?? "No plan"} · ${tenant.status === "trial" && trialDays !== null ? (trialDays > 0 ? `trial, ${trialDays} days left` : "trial expired") : tenant.status.replace("_", " ")}`;
  return (
    <div className="min-h-screen bg-slate-50" style={{ ["--store" as string]: tenant.primaryColor }}>
      {session.imp && (
        <div className="flex flex-wrap items-center justify-center gap-3 bg-amber-400 px-4 py-2 text-sm font-medium text-amber-950 print:hidden">
          Impersonating {user.name} ({user.email}) at {tenant.name}. Actions are audit-logged.
          <a href="/api/v1/superadmin/impersonate/stop" className="rounded bg-amber-950 px-3 py-1 text-xs font-semibold text-white">Return to superadmin</a>
        </div>
      )}
      {(tenant.status === "past_due" || (tenant.status === "trial" && trialDays !== null && trialDays <= 3)) && (
        <div className="bg-red-600 px-4 py-2 text-center text-sm text-white print:hidden">
          {tenant.status === "past_due" ? "Your subscription payment is overdue." : `Your trial ends in ${Math.max(0, trialDays!)} day(s).`}{" "}
          <a className="font-semibold underline" href="/admin/billing">Go to billing</a>
        </div>
      )}
      <div className="lg:flex">
        <AdminNav shopName={tenant.name} storeUrl={storePath(tenant.slug)} isOwner={user.role === "owner"} userName={user.name} planLine={planLine} />
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8 print:p-0">{children}</main>
      </div>
    </div>
  );
}
