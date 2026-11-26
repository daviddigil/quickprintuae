"use client";
import { useState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { getCopy, type Locale } from "@/lib/i18n";

/** Shown instead of signup in production while no live payment gateway is configured. */
export function WaitlistForm({ locale = "en", trialDays }: { locale?: Locale; trialDays?: number }) {
  const t = getCopy(locale, trialDays).signup.waitlist;
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(null); setState("sending");
    const fd = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch("/api/v1/signup/waitlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...fd, locale }) });
    if (!res.ok) { setState("idle"); setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? t.failed); return; }
    setState("done");
  }
  return (
    <section aria-labelledby="wl-h" data-testid="waitlist" className="space-y-4 rounded-shape-xl border border-outline-variant bg-surface-lowest p-5 sm:p-6">
      <h2 id="wl-h" className="text-xl font-bold">{t.h}</h2>
      <p className="text-sm text-on-surface-variant">{t.lead}</p>
      {state === "done" ? <Alert tone="green">{t.done}</Alert> : (
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field label={t.email}><Input name="email" type="email" required autoComplete="email" dir="ltr" /></Field>
          <Field label={t.shop}><Input name="shopName" autoComplete="organization" /></Field>
          <Button size="lg" className="w-full" disabled={state === "sending"}>{state === "sending" ? t.sending : t.submit}</Button>
        </form>
      )}
    </section>
  );
}
