"use client";
import { useActionState, useEffect } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { confirmStepUp } from "@/server/security/stepup-actions";

/**
 * Asks for a fresh authenticator code (or the password when the account has no 2FA) before a sensitive action.
 *   <StepUpPrompt method="totp" onVerified={() => retry()} />      inline (modal/panel)
 *   <StepUpPrompt method="password" next="/superadmin/payouts" />  full page: redirects to `next` after success
 * `method` comes from `await stepUpMethod()` on the server (or StepUpRequiredError.method).
 */
export function StepUpPrompt({ method, next, onVerified, reason }: { method: "totp" | "password"; next?: string; onVerified?: () => void; reason?: string }) {
  const [state, action, pending] = useActionState(confirmStepUp, null);
  useEffect(() => { if (state?.ok) onVerified?.(); }, [state, onVerified]);
  const totp = method === "totp";
  return (
    <form action={action} className="space-y-4" data-testid="stepup-form">
      {next && <input type="hidden" name="next" value={next} />}
      <p className="text-sm text-on-surface-variant">{reason ?? "This is a sensitive action."} {totp ? "Enter the 6-digit code from your authenticator app (or a recovery code) to continue." : "Enter your password to continue."}</p>
      {state && !state.ok && <Alert>{state.error}</Alert>}
      {state?.ok && !next && <Alert tone="green">Verified. You can continue for the next 10 minutes.</Alert>}
      <Field label={totp ? "Authenticator or recovery code" : "Password"}>
        <Input name="credential" required autoFocus autoComplete={totp ? "one-time-code" : "current-password"} type={totp ? "text" : "password"} inputMode={totp ? "numeric" : undefined} />
      </Field>
      <Button className="w-full" disabled={pending}>{pending ? "Checking…" : "Verify"}</Button>
    </form>
  );
}
