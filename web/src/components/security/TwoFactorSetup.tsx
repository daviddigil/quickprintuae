"use client";
import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { confirmTwoFactor, regenerateCodesAction, disableTwoFactorAction, type TwoFactorState } from "@/server/security/twofactor-actions";

function Codes({ codes }: { codes: string[] }) {
  return (
    <div className="space-y-3" data-testid="recovery-codes">
      <Alert tone="yellow">Save these 10 recovery codes now. Each works once if you lose your phone. They are shown only this one time.</Alert>
      <ul className="grid grid-cols-2 gap-2 font-mono text-sm">{codes.map((c) => <li key={c} className="rounded-shape-md border border-outline-variant bg-surface-low px-3 py-2">{c}</li>)}</ul>
    </div>
  );
}

/** Enrolment form: scan QR, enter first code, receive recovery codes once. */
export function TwoFactorEnrol({ qr, secret }: { qr: string; secret: string }) {
  const [state, action, pending] = useActionState<TwoFactorState | null, FormData>(confirmTwoFactor, null);
  if (state?.ok && state.recoveryCodes) return (<div className="space-y-4"><Alert tone="green">Two-factor authentication is on.</Alert><Codes codes={state.recoveryCodes} /></div>);
  return (
    <form action={action} className="grid gap-6 md:grid-cols-[auto_1fr]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr} alt="QR code to add QuickPrint to your authenticator app" width={220} height={220} className="rounded-shape-md border border-outline-variant bg-white" />
      <div className="space-y-4">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-on-surface-variant">
          <li>Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy).</li>
          <li>Scan the QR code, or enter this key by hand: <code data-testid="totp-secret" className="break-all rounded bg-surface-low px-1 font-mono text-on-surface">{secret}</code></li>
          <li>Type the 6-digit code it shows.</li>
        </ol>
        {state?.error && <Alert>{state.error}</Alert>}
        <Field label="6-digit code"><Input name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={8} pattern="[0-9 ]{6,8}" data-testid="enrol-code" /></Field>
        <Button disabled={pending}>{pending ? "Checking…" : "Turn on two-factor"}</Button>
      </div>
    </form>
  );
}

export function RecoveryCodesButton() {
  const [state, action, pending] = useActionState<TwoFactorState | null>(regenerateCodesAction, null);
  return (
    <form action={action} className="space-y-3">
      {state?.recoveryCodes && <Codes codes={state.recoveryCodes} />}
      <Button variant="outlined" disabled={pending}>{pending ? "Working…" : "Generate new recovery codes"}</Button>
    </form>
  );
}

export function DisableTwoFactorButton() {
  return <form action={disableTwoFactorAction}><Button variant="outlined">Turn off two-factor</Button></form>;
}
