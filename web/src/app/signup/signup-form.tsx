"use client";
import { useEffect, useState } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { EMIRATES } from "@/lib/types";

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);

export function SignupForm({ plans, defaultPlan }: { plans: { code: string; name: string; price: number; feePct?: number; commission?: boolean }[]; defaultPlan?: string }) {
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

  const shopDone = shopName.trim().length > 1 && slug.length >= 3 && slugState?.available !== false;
  const planLabel = (p: { name: string; price: number; feePct?: number; commission?: boolean }) =>
    p.commission ? `${p.name}: AED 0 a month, ${p.feePct ?? 0}% per paid order` : `${p.name}: AED ${p.price.toLocaleString("en-AE")} a month`;

  const section = "rounded-shape-xl border border-outline-variant bg-surface-lowest p-5 sm:p-6";
  const dot = (n: number, done: boolean) => (
    <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${done ? "bg-success text-on-success" : "bg-primary text-on-primary"}`}>{done ? "✓" : n}</span>
  );
  return (
    <form onSubmit={submit} className="space-y-5">
      <ol aria-label="Progress" className="flex items-center gap-3 text-sm font-medium">
        <li className="flex items-center gap-2">{dot(1, shopDone)}<span>Your shop</span></li>
        <li aria-hidden className="h-px flex-1 bg-outline-variant" />
        <li className="flex items-center gap-2">{dot(2, false)}<span>You and your plan</span></li>
      </ol>
      {error && <Alert>{error}</Alert>}

      <fieldset className={section}>
        <legend className="sr-only">Your shop</legend>
        <div className="space-y-4">
          <Field label="Shop name"><Input value={shopName} onChange={(e) => setShopName(e.target.value)} required placeholder="Al Noor Printing" autoComplete="organization" /></Field>
          <Field label="Store address">
            <div className="flex items-center rounded-shape-md border border-outline-variant bg-surface-lowest focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25">
              <Input value={slug} onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }} required className="border-0 bg-transparent focus:ring-0" placeholder="alnoor" aria-label="Store slug" aria-describedby="slug-status" />
              <span className="whitespace-nowrap pe-3 text-sm text-on-surface-variant">.quickprint.ae</span>
            </div>
            <p id="slug-status" aria-live="polite" className={`mt-1.5 min-h-4 text-xs ${slugState ? (slugState.available ? "text-success" : "text-critical") : "text-on-surface-variant"}`}>
              {slugState ? (slugState.available ? "✓ Available" : slugState.reason) : "Letters, numbers and dashes. You can add your own domain later."}
            </p>
          </Field>
          <Field label="Emirate"><Select name="emirate" defaultValue="Dubai" autoComplete="address-level1">{EMIRATES.map((e) => <option key={e}>{e}</option>)}</Select></Field>
        </div>
      </fieldset>

      <fieldset className={section}>
        <legend className="sr-only">You and your plan</legend>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your name"><Input name="ownerName" required autoComplete="name" /></Field>
            <Field label="Mobile"><Input name="phone" required type="tel" placeholder="+971 50 123 4567" autoComplete="tel" /></Field>
          </div>
          <Field label="Work email"><Input name="email" type="email" required autoComplete="email" /></Field>
          <Field label="Password" hint="(at least 8 characters)"><Input name="password" type="password" minLength={8} required autoComplete="new-password" /></Field>
          <Field label="Plan">
            <Select name="plan" defaultValue={plans.some((p) => p.code === defaultPlan) ? defaultPlan : "growth"}>
              {plans.map((p) => <option key={p.code} value={p.code}>{planLabel(p)}</option>)}
            </Select>
          </Field>
          <p className="text-xs text-on-surface-variant">Free for 14 days. No card needed. You can change plan any time.</p>
        </div>
      </fieldset>

      <Button size="lg" className="w-full" disabled={loading || slugState?.available === false}>{loading ? "Setting up your shop…" : "Create my shop, free for 14 days"}</Button>
      <p className="text-center text-xs text-on-surface-variant">By creating a shop you agree to the Terms and Privacy Policy.</p>
    </form>
  );
}
