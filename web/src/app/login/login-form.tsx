"use client";
import { useState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";

export function LoginForm({ next, store, onDone }: { next?: string; store?: string; onDone?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/v1/auth/login", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: fd.get("email"), password: fd.get("password"), store }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) return setError(data.error ?? "Login failed");
    window.location.href = (next && next.startsWith("/") ? next : null) ?? data.redirect ?? onDone ?? "/";
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Alert>{error}</Alert>}
      <Field label="Email"><Input name="email" type="email" required autoComplete="email" /></Field>
      <Field label="Password"><Input name="password" type="password" required autoComplete="current-password" /></Field>
      <Button className="w-full" disabled={loading} variant={store ? "store" : "primary"}>{loading ? "Signing in…" : "Sign in"}</Button>
    </form>
  );
}
