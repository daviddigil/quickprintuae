"use client";
import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { resetPassword } from "./actions";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword.bind(null, token), null);
  if (state?.done) return (
    <div className="space-y-4">
      <Alert tone="green"><span data-testid="reset-done">Your password has been changed. Sign in again with the new password.</span></Alert>
      <a className="inline-flex min-h-11 w-full items-center justify-center rounded-shape-xl bg-primary px-4 font-semibold text-on-primary" href="/login">Sign in</a>
    </div>
  );
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert>{state.error}</Alert>}
      <Field label="New password" hint="(at least 10 characters)"><Input name="password" type="password" required minLength={10} maxLength={128} autoComplete="new-password" /></Field>
      <Field label="Repeat the new password"><Input name="confirm" type="password" required minLength={10} maxLength={128} autoComplete="new-password" /></Field>
      <Button className="w-full" disabled={pending}>{pending ? "Saving…" : "Change password"}</Button>
    </form>
  );
}
