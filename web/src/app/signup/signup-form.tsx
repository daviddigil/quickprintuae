"use client";
import { useEffect, useState } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { EMIRATES } from "@/lib/types";

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);

export function SignupForm({ plans, defaultPlan }: { plans: { code: string; name: string; price: number }[]; defaultPlan?: string }) {
  const [shopName, setShopName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState<{ available: boolean; reason?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (!slugTouched) setSlug(slugify(shopName)); }, [shopName, slugTouched]);
  useEffect(() => {
    if (slug.length < 3) { setSlugState(null); return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/v1/signup/check-slug?slug=${encodeURIComponent(slug)}`, { signal: ctrl.signal })
        .then((r) => r.json()).then(setSlugState).catch(() => {});
    }, 300);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [slug]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null); setLoading(true);
    const fd = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch("/api/v1/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...fd, shopName, slug }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setLoading(false); setError(data.error ?? "Signup failed"); return; }
    window.location.href = data.redirect ?? "/admin";
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border bg-white p-6 shadow-sm">
      {error && <Alert>{error}</Alert>}
      <Field label="Shop name"><Input value={shopName} onChange={(e) => setShopName(e.target.value)} required placeholder="Al Noor Printing" /></Field>
      <Field label="Store address">
        <div className="flex items-center rounded-lg border border-outline-variant bg-white focus-within:ring-2 focus-within:ring-slate-200">
          <Input value={slug} onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }} required className="border-0 focus:ring-0" placeholder="alnoor" aria-label="Store slug" />
          <span className="whitespace-nowrap pr-3 text-sm text-outline">.quickprint.ae</span>
        </div>
        {slugState && <p className={`mt-1 text-xs ${slugState.available ? "text-success" : "text-critical"}`}>{slugState.available ? "✓ Available" : slugState.reason}</p>}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name"><Input name="ownerName" required autoComplete="name" /></Field>
        <Field label="Mobile"><Input name="phone" required type="tel" placeholder="+971 50 123 4567" autoComplete="tel" /></Field>
      </div>
      <Field label="Work email"><Input name="email" type="email" required autoComplete="email" /></Field>
      <Field label="Password" hint="(min 8 characters)"><Input name="password" type="password" minLength={8} required autoComplete="new-password" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Emirate"><Select name="emirate" defaultValue="Dubai">{EMIRATES.map((e) => <option key={e}>{e}</option>)}</Select></Field>
        <Field label="Plan">
          <Select name="plan" defaultValue={plans.some((p) => p.code === defaultPlan) ? defaultPlan : "growth"}>
            {plans.map((p) => <option key={p.code} value={p.code}>{p.name} — AED {p.price}/mo</option>)}
          </Select>
        </Field>
      </div>
      <Button className="w-full" disabled={loading || slugState?.available === false}>{loading ? "Setting up your shop…" : "Create my shop — free for 14 days"}</Button>
      <p className="text-center text-xs text-on-surface-variant">By signing up you agree to the Terms and Privacy Policy.</p>
    </form>
  );
}
