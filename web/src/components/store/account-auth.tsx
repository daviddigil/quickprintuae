"use client";
import { useState } from "react";
import { LoginForm } from "@/app/login/login-form";
import { Alert, Button, Field, Input, cn } from "@/components/ui";

export function AccountAuth({ store }: { store: string }) {
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = `/s/${store}/account`;

  async function signup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErr(null); setBusy(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/v1/store/${store}/signup`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(fd.entries())),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(data.error ?? "Sign up failed");
    window.location.href = next;
  }

  return (
    <div className="mx-auto max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm">
        {(["login", "signup"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("rounded-md py-1.5 font-medium", tab === t ? "bg-white shadow-sm" : "text-slate-600")}>{t === "login" ? "Sign in" : "Create account"}</button>
        ))}
      </div>
      {tab === "login" ? <LoginForm store={store} next={next} /> : (
        <form onSubmit={signup} className="space-y-4">
          {err && <Alert>{err}</Alert>}
          <Field label="Full name"><Input name="name" required autoComplete="name" /></Field>
          <Field label="Email"><Input name="email" type="email" required autoComplete="email" /></Field>
          <Field label="Mobile"><Input name="phone" type="tel" required placeholder="+971 5x xxx xxxx" autoComplete="tel" /></Field>
          <Field label="Password" hint="(min 8 characters)"><Input name="password" type="password" minLength={8} required autoComplete="new-password" /></Field>
          <Button variant="store" className="w-full" disabled={busy}>{busy ? "Creating…" : "Create account"}</Button>
        </form>
      )}
      <p className="mt-4 text-center text-xs text-slate-500">You can also check out as a guest.</p>
    </div>
  );
}
