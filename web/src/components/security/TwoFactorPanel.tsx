import { Alert, Badge, Card, CardHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { superadminMustHave2FA } from "@/server/security/policy";
import { getEnrolmentQr } from "@/server/security/twofactor-actions";
import { DisableTwoFactorButton, RecoveryCodesButton, TwoFactorEnrol } from "./TwoFactorSetup";
import { StartEnrolmentButton } from "./StartEnrolmentButton";

/** Self-contained "Two-factor authentication" card for the superadmin security page and the shop-owner settings page. */
export async function TwoFactorPanel({ required, started }: { required?: boolean; started?: boolean }) {
  const cu = await getCurrentUser();
  if (!cu) return null;
  const { user } = cu;
  const mandatory = user.role === "superadmin" && superadminMustHave2FA();
  const enabled = !!user.totpEnabledAt;
  const enrol = !enabled && started ? await getEnrolmentQr() : null;
  return (
    <Card data-testid="two-factor-panel">
      <CardHeader title="Two-factor authentication" subtitle="Protects your account with a code from your phone, on top of your password." action={<Badge tone={enabled ? "green" : "yellow"}>{enabled ? "On" : "Off"}</Badge>} />
      <div className="space-y-4 p-5">
        {required && !enabled && <Alert tone="yellow">Platform administrators must turn on two-factor authentication before they can use the admin area.</Alert>}
        {enabled ? (
          <>
            <p className="text-sm text-on-surface-variant">Turned on {user.totpEnabledAt!.toLocaleDateString("en-GB")}. Recovery codes left: <strong>{user.recoveryCodesHash.length}</strong>. Changing these settings asks for a fresh code.</p>
            <RecoveryCodesButton />
            {!mandatory && <DisableTwoFactorButton />}
            {mandatory && <p className="text-sm text-on-surface-variant">Two-factor cannot be turned off for platform administrators in production.</p>}
          </>
        ) : enrol ? <TwoFactorEnrol qr={enrol.qr} secret={enrol.secret} /> : <StartEnrolmentButton />}
      </div>
    </Card>
  );
}
