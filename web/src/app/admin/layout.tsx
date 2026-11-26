import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { storePath } from "@/lib/tenant";
import { hasFeature } from "@/server/billing";
import { newQuoteCount } from "@/server/quotes";
import { AdminNav } from "@/components/admin/AdminNav";
import { PoweredBy } from "@/components/PoweredBy";
import { CardStep } from "@/components/platform/CardStep";
import { setupMode } from "@/server/billing/gateway";
import { getVerification } from "@/server/trust/verification";
import { VerificationBanner } from "./verification/banner";

export const metadata = { title: { default: "Admin", template: "%s · Admin" } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { tenant, user, session } = await requireStaff();
  // signed up but no card yet: nothing else in the panel until the card is on file (that starts the 14-day trial)
  if (tenant.status === "incomplete") {
    const mode = await setupMode();
    return (
      <div className="min-h-screen bg-surface-low px-4 py-10">
        <div className="mx-auto max-w-lg space-y-4">
          <p className="text-sm font-semibold text-on-surface-variant">{tenant.name}</p>
          {user.role === "owner"
            ? <CardStep live={!!mode.live} fake={mode.fake} email={user.email} readQuery />
            : <p className="rounded-shape-md bg-warning-container p-4 text-sm text-on-warning-container">The shop owner needs to add a card to start the trial. Ask them to sign in.</p>}
          <PoweredBy className="pt-4 text-center" />
        </div>
      </div>
    );
  }
  const verification = tenant.verificationStatus === "verified" ? null : await getVerification(tenant.id);
  const plan = tenant.planId ? await db.query.plans.findFirst({ where: eq(schema.plans.id, tenant.planId) }) : null;
  const walkIn = await hasFeature(tenant, "walk_in_queue");
  const newQuotes = await newQuoteCount(tenant.id);
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
      {tenant.verificationStatus !== "verified" && <VerificationBanner status={tenant.verificationStatus} detail={verification?.status} reason={verification?.reason} />}
      <div className="lg:flex">
        <AdminNav shopName={tenant.name} storeUrl={storePath(tenant.slug)} isOwner={user.role === "owner"} userName={user.name} planLine={planLine} walkIn={walkIn} newQuotes={newQuotes} />
        <div className="flex min-w-0 flex-1 flex-col"><main className="flex-1 p-4 sm:p-6 lg:p-8 print:p-0">{children}</main><PoweredBy className="pb-4 text-center print:hidden" /></div>
      </div>
    </div>
  );
}
