import { TwoFactorPanel } from "@/components/security/TwoFactorPanel";
import { Alert, Card, CardHeader } from "@/components/ui";
import { requireSuperadmin } from "@/lib/auth";
import { superadminMustHave2FA } from "@/server/security/policy";

export const metadata = { title: "Security" };
export const dynamic = "force-dynamic";

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ required?: string; setup?: string; error?: string }> }) {
  await requireSuperadmin();
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-headline font-semibold">Security</h1>
        <p className="text-on-surface-variant">Protect the account that can approve payouts and change payment gateways.</p>
      </div>
      {sp.error === "required" && <Alert>Two-factor cannot be turned off for platform administrators.</Alert>}
      <TwoFactorPanel required={sp.required === "1"} started={sp.setup === "1"} />
      <Card>
        <CardHeader title="Sensitive actions" />
        <ul className="list-disc space-y-1 p-5 pl-9 text-sm text-on-surface-variant">
          <li>Gateway key changes, revealing a bank IBAN and approving payouts ask for a fresh code (valid for 10 minutes).</li>
          <li>Five wrong passwords or codes lock an account for 15 minutes; every lockout and 2FA change is in the audit log.</li>
          <li>Policy: two-factor is {superadminMustHave2FA() ? "mandatory" : "optional here (REQUIRE_SUPERADMIN_2FA=0 or non-production)"} for administrators.</li>
        </ul>
      </Card>
    </div>
  );
}
