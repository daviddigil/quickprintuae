"use client";
import { useEffect, useState } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { EMIRATES } from "@/lib/types";
import { fill, getCopy, type Locale } from "@/lib/i18n";
import { CardStep } from "@/components/platform/CardStep";

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);

export function SignupForm({ plans, defaultPlan, locale = "en", live, fake, trialDays }: { trialDays?: number; plans: { code: string; name: string; price: number; feePct?: number; commission?: boolean }[]; defaultPlan?: string; locale?: Locale; live: boolean; fake: boolean }) {
  const copy = getCopy(locale, trialDays), t = copy.signup.form, ar = locale === "ar";
  // Latin-only fields (email, phone, slug, password) stay left-to-right inside an Arabic form
  const ltr = ar ? ({ dir: "ltr" } as const) : {};
  const [shopName, setShopName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState<{ available: boolean; reason?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"account" | "card">("account");
  const [email, setEmail] = useState("");

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
    if (!res.ok) { setLoading(false); setError(data.error ?? t.failed); return; }
    // step 2: the shop exists as 'incomplete' and the owner is signed in; the trial starts when the card is on file
    setEmail(String(fd.email ?? "")); setLoading(false); setStep("card");
    window.scrollTo({ top: 0 });
  }

  const shopDone = shopName.trim().length > 1 && slug.length >= 3 && slugState?.available !== false;
  const planLabel = (p: { name: string; price: number; feePct?: number; commission?: boolean }) => {
    const name = copy.priceTable.planNames[p.name] ?? p.name;
    return p.commission ? fill(t.planPayg, { name, pct: p.feePct ?? 0 }) : fill(t.planSub, { name, price: p.price.toLocaleString("en-AE") });
  };

  const section = "rounded-shape-xl border border-outline-variant bg-surface-lowest p-5 sm:p-6";
  const dot = (n: number, done: boolean) => (
    <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${done ? "bg-success text-on-success" : "bg-primary text-on-primary"}`}>{done ? "✓" : n}</span>
  );
  const progress = (
      <ol aria-label={t.progress} className="flex items-center gap-3 text-sm font-medium">
        <li className="flex items-center gap-2" aria-current={step === "account" ? "step" : undefined}>{dot(1, step === "card" || shopDone)}<span>{t.stepAccount}</span></li>
        <li aria-hidden className="h-px flex-1 bg-outline-variant" />
        <li className="flex items-center gap-2" aria-current={step === "card" ? "step" : undefined}>{dot(2, false)}<span>{t.stepCard}</span></li>
      </ol>
  );
  if (step === "card") {
    return (
      <div className="space-y-5">
        {progress}
        <CardStep locale={locale} trialDays={trialDays} live={live} fake={fake} email={email} />
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-5">
      {progress}
      {error && <Alert>{error}</Alert>}

      <fieldset className={section}>
        <legend className="sr-only">{t.step1}</legend>
        <div className="space-y-4">
          <Field label={t.shopName}><Input value={shopName} onChange={(e) => setShopName(e.target.value)} required placeholder={ar ? "مطبعة النور" : "Al Noor Printing"} autoComplete="organization" /></Field>
          <Field label={t.storeAddress}>
            <div dir="ltr" className="flex items-center rounded-shape-md border border-outline-variant bg-surface-lowest focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25">
              <Input value={slug} onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }} required className="border-0 bg-transparent focus:ring-0" placeholder="alnoor" aria-label={t.slugAria} aria-describedby="slug-status" />
              <span className="whitespace-nowrap pe-3 text-sm text-on-surface-variant">.quickprint.ae</span>
            </div>
            <p id="slug-status" aria-live="polite" className={`mt-1.5 min-h-4 text-xs ${slugState ? (slugState.available ? "text-success" : "text-critical") : "text-on-surface-variant"}`}>
              {slugState ? (slugState.available ? t.available : slugState.reason) : t.slugHint}
            </p>
          </Field>
          <Field label={t.emirate}><Select name="emirate" defaultValue="Dubai" autoComplete="address-level1">{EMIRATES.map((e) => <option key={e} value={e}>{t.emirates[e] ?? e}</option>)}</Select></Field>
        </div>
      </fieldset>

      <fieldset className={section}>
        <legend className="sr-only">{t.step2}</legend>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.ownerName}><Input name="ownerName" required autoComplete="name" /></Field>
            <Field label={t.mobile}><Input name="phone" required type="tel" placeholder="+971 50 123 4567" autoComplete="tel" {...ltr} /></Field>
          </div>
          <Field label={t.email}><Input name="email" type="email" required autoComplete="email" {...ltr} /></Field>
          <Field label={t.password} hint={t.passwordHint}><Input name="password" type="password" minLength={8} required autoComplete="new-password" {...ltr} /></Field>
          <Field label={t.plan}>
            <Select name="plan" defaultValue={plans.some((p) => p.code === defaultPlan) ? defaultPlan : "growth"}>
              {plans.map((p) => <option key={p.code} value={p.code}>{planLabel(p)}</option>)}
            </Select>
          </Field>
          <p className="text-xs text-on-surface-variant">{t.note}</p>
        </div>
      </fieldset>

      <Button size="lg" className="w-full" disabled={loading || slugState?.available === false}>{loading ? t.loading : t.submit}</Button>
      <p className="text-center text-xs text-on-surface-variant">{t.terms}</p>
    </form>
  );
}
