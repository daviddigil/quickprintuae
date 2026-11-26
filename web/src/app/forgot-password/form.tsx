"use client";
import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { forgotPassword } from "./actions";

export function ForgotForm({ store }: { store?: string }) {
  const [state, action, pending] = useActionState(forgotPassword, null);
  if (state?.done) return <Alert tone="green"><span data-testid="forgot-done">If an account exists for that email, we have sent a reset link. It is valid for 60 minutes. Check your spam folder if it does not arrive.</span></Alert>;
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert>{state.error}</Alert>}
      {store && <input type="hidden" name="store" value={store} />}
      <Field label="Email"><Input name="email" type="email" required autoComplete="email" /></Field>
      <Button className="w-full" disabled={pending}>{pending ? "Sending…" : "Send reset link"}</Button>
    </form>
  );
}
