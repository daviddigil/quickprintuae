"use client";
import { useState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";

export function LoginForm({ next, store, onDone }: { next?: string; store?: string; onDone?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"password" | "code">("password");
  const variant = store ? "store" : "primary";
  const go = (data: { redirect?: string | null }) => { window.location.href = (next && next.startsWith("/") && !next.startsWith("//") ? next : null) ?? data.redirect ?? onDone ?? "/"; };

  async function post(url: string, body: unknown) {
    setLoading(true); setError(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      return { res, data };
    } finally { setLoading(false); }
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (step === "password") {
      const { res, data } = await post("/api/v1/auth/login", { email: fd.get("email"), password: fd.get("password"), store });
      if (!res.ok) return setError(data.error ?? "Sign-in failed");
      if (data.twoFactor) return setStep("code");
      return go(data);
    }
    const { res, data } = await post("/api/v1/auth/2fa", { code: fd.get("code") });
    if (!res.ok) { if (data.expired) setStep("password"); return setError(data.error ?? "Invalid code"); }
    go(data);
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Alert>{error}</Alert>}
      {step === "password" ? (
        <>
          <Field label="Email"><Input name="email" type="email" required autoComplete="email" /></Field>
          <Field label="Password"><Input name="password" type="password" required autoComplete="current-password" /></Field>
          <Button className="w-full" disabled={loading} variant={variant}>{loading ? "Signing in…" : "Sign in"}</Button>
          <p className="text-center text-sm"><a className="inline-flex min-h-11 items-center text-primary" href={store ? `/forgot-password?store=${encodeURIComponent(store)}` : "/forgot-password"}>Forgot your password?</a></p>
        </>
      ) : (
        <>
          <p className="text-sm text-on-surface-variant">Two-factor authentication is on for this account. Enter the 6-digit code from your authenticator app, or one of your recovery codes.</p>
          <Field label="Authentication code"><Input name="code" required autoFocus autoComplete="one-time-code" inputMode="text" data-testid="totp-code" /></Field>
          <Button className="w-full" disabled={loading} variant={variant}>{loading ? "Checking…" : "Verify and sign in"}</Button>
        </>
      )}
    </form>
  );
}
