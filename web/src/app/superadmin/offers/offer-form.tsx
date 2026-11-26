"use client";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { Alert, Button, Card, CardHeader, Field, Input, Select, Switch, Textarea } from "@/components/ui";
import { OfferBanner } from "@/components/offers/OfferBanner";
import { OFFER_KINDS, OFFER_THEMES, describeOffer, validateOffer, type OfferKind, type OfferTheme } from "@/lib/offers";
import { THEME_PRESETS, fromDubaiInput, toDubaiInput } from "@/lib/offer-themes";
import { chargeDiscount, firstChargePrice } from "@/lib/offer-price";
import { saveOffer, type OfferFormState } from "./actions";

export interface FormPlan { code: string; name: string; priceMonthly: number; priceYearly: number; billingModel: string }
export interface FormOffer {
  id?: string; name: string; code: string; headline: string; description: string; theme: OfferTheme; kind: OfferKind; value: number; durationMonths: number | null;
  planCodes: string[]; cycles: string[]; audience: "new" | "all"; startsAt: string; endsAt: string; maxRedemptions: number | null; showBanner: boolean; status: "draft" | "active" | "paused"; redeemedCount?: number;
}
const KIND_LABEL: Record<OfferKind, string> = { percent: "Percent off the subscription", amount: "AED off the subscription (per month)", free_months: "Free months", trial_extension: "Extra free trial days" };
const aed = (n: number) => `AED ${n.toLocaleString("en-AE", { maximumFractionDigits: 2 })}`;

export function OfferForm({ initial, plans, isNew }: { initial: FormOffer; plans: FormPlan[]; isNew: boolean }) {
  const [state, action, pending] = useActionState<OfferFormState, FormData>(saveOffer, null);
  const [f, setF] = useState<FormOffer>(initial);
  const set = <K extends keyof FormOffer>(k: K, v: FormOffer[K]) => setF((p) => ({ ...p, [k]: v }));
  const err = state?.errors ?? {};

  function pickTheme(t: OfferTheme) {
    const p = THEME_PRESETS[t];
    const w = p.window(new Date());
    setF((x) => ({ ...x, theme: t, ...(t === "custom" ? {} : { name: p.name, headline: p.headline, startsAt: toDubaiInput(w.startsAt), endsAt: toDubaiInput(w.endsAt) }) }));
  }
  const live = useMemo(() => {
    const issues = validateOffer({ name: f.name, kind: f.kind, value: f.value, durationMonths: f.durationMonths, startsAt: fromDubaiInput(f.startsAt), endsAt: fromDubaiInput(f.endsAt), maxRedemptions: f.maxRedemptions, code: f.code || null });
    return Object.fromEntries(issues.map((i) => [i.field, i.message]));
  }, [f]);
  const shown = (k: string) => err[k] ?? (touched[k] ? live[k] : undefined);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const blur = (k: string) => () => setTouched((t) => ({ ...t, [k]: true }));

  const eligible = plans.filter((p) => p.billingModel !== "commission" && (f.planCodes.length === 0 || f.planCodes.includes(p.code)));
  const bannerOffer = { id: f.id ?? "preview", name: f.name || "Offer name", code: f.code ? f.code.toUpperCase() : null, headline: f.headline, theme: f.theme, kind: f.kind, value: f.value, durationMonths: f.durationMonths, endsAt: fromDubaiInput(f.endsAt) ?? new Date(Date.now() + 7 * 86400_000) };
  const months = f.kind === "free_months" ? Math.round(f.value) : f.durationMonths;
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const hasValue = f.kind === "percent" || f.kind === "amount";
  const fe = (k: string) => { const m = shown(k); return m ? <p role="alert" className="text-xs text-critical sm:col-span-2" data-testid={`err-${k}`}>{m}</p> : null; };

  return (
    <form action={action} className="space-y-6" data-testid="offer-form">
      {f.id && <input type="hidden" name="id" value={f.id} />}
      {state?.message && <Alert>{state.message}</Alert>}

      <Card>
        <CardHeader title="Theme" subtitle="A preset fills a name, headline, colours and the usual dates. Everything stays editable." />
        <div className="flex flex-wrap gap-2 p-5" role="radiogroup" aria-label="Theme">
          {OFFER_THEMES.map((t) => (
            <button key={t} type="button" role="radio" aria-checked={f.theme === t} data-testid={`theme-${t}`} onClick={() => pickTheme(t)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium ${f.theme === t ? "border-primary bg-primary-container text-on-primary-container" : "border-outline-variant bg-surface-lowest"}`}>
              <span aria-hidden className="size-3 rounded-full border border-outline" style={{ background: THEME_PRESETS[t].style.bg }} />{THEME_PRESETS[t].label}
            </button>
          ))}
          <input type="hidden" name="theme" value={f.theme} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Offer" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Name"><Input name="name" value={f.name} onChange={(e) => set("name", e.target.value)} onBlur={blur("name")} required aria-invalid={!!shown("name")} data-testid="f-name" /></Field>{fe("name")}
          <Field label="Promo code" hint="(optional, blank = applied automatically)"><Input name="code" value={f.code} onChange={(e) => set("code", e.target.value.toUpperCase())} onBlur={blur("code")} autoCapitalize="characters" dir="ltr" data-testid="f-code" aria-invalid={!!shown("code")} /></Field>{fe("code")}
          <div className="sm:col-span-2"><Field label="Banner headline"><Input name="headline" value={f.headline} onChange={(e) => set("headline", e.target.value)} data-testid="f-headline" /></Field>{fe("headline")}</div>
          <div className="sm:col-span-2"><Field label="Description" hint="(internal note, optional)"><Textarea name="description" rows={2} value={f.description} onChange={(e) => set("description", e.target.value)} /></Field></div>
          <Field label="Discount type">
            <Select name="kind" value={f.kind} onChange={(e) => set("kind", e.target.value as OfferKind)} data-testid="f-kind">{OFFER_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</Select>
          </Field>{fe("kind")}
          <Field label={f.kind === "percent" ? "Percent (%)" : f.kind === "amount" ? "Amount (AED)" : f.kind === "free_months" ? "Free months" : "Extra trial days"}>
            <Input name="value" type="number" step={hasValue ? "0.01" : "1"} min="0" value={f.value} onChange={(e) => set("value", Number(e.target.value))} onBlur={blur("value")} required data-testid="f-value" aria-invalid={!!shown("value")} />
          </Field>{fe("value")}
          {hasValue && (
            <Field label="Lasts (months)" hint="(blank = for as long as they stay)">
              <Input name="durationMonths" type="number" min="1" max="36" step="1" value={f.durationMonths ?? ""} onChange={(e) => set("durationMonths", e.target.value === "" ? null : Number(e.target.value))} data-testid="f-duration" />
            </Field>
          )}
          {hasValue && fe("durationMonths")}
          <Field label="Audience">
            <Select name="audience" value={f.audience} onChange={(e) => set("audience", e.target.value as "new" | "all")} data-testid="f-audience">
              <option value="new">New signups only</option><option value="all">All shops (existing shops can claim it)</option>
            </Select>
          </Field>
          <Field label="Max redemptions" hint="(blank = unlimited)"><Input name="maxRedemptions" type="number" min="1" step="1" value={f.maxRedemptions ?? ""} onChange={(e) => set("maxRedemptions", e.target.value === "" ? null : Number(e.target.value))} data-testid="f-max" aria-invalid={!!shown("maxRedemptions")} /></Field>{fe("maxRedemptions")}
          <Field label="Starts (Dubai time)"><Input name="startsAt" type="datetime-local" value={f.startsAt} onChange={(e) => set("startsAt", e.target.value)} required data-testid="f-starts" /></Field>
          <Field label="Ends (Dubai time)"><Input name="endsAt" type="datetime-local" value={f.endsAt} onChange={(e) => set("endsAt", e.target.value)} required data-testid="f-ends" /></Field>
          {(err.dates || live.dates) && <p role="alert" className="text-xs text-critical sm:col-span-2" data-testid="err-dates">{err.dates ?? live.dates}</p>}
        </div>
        <div className="grid gap-5 border-t border-outline-variant p-5 sm:grid-cols-2">
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Plans <span className="font-normal text-on-surface-variant">(none ticked = all plans)</span></legend>
            {plans.map((p) => (
              <label key={p.code} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="planCodes" value={p.code} checked={f.planCodes.includes(p.code)} onChange={() => set("planCodes", toggle(f.planCodes, p.code))} className="size-5 accent-[var(--md-primary)]" data-testid={`plan-${p.code}`} />{p.name}</label>
            ))}
            {fe("planCodes")}
          </fieldset>
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Billing cycles</legend>
            {(["monthly", "yearly"] as const).map((c) => (
              <label key={c} className="flex min-h-11 items-center gap-3 text-sm capitalize"><input type="checkbox" name="cycles" value={c} checked={f.cycles.includes(c)} onChange={() => set("cycles", toggle(f.cycles, c))} className="size-5 accent-[var(--md-primary)]" data-testid={`cycle-${c}`} />{c}</label>
            ))}
            {fe("cycles")}
            <p className="mt-1 text-xs text-on-surface-variant">Yearly plans: a percent or AED amount applies to the whole yearly charge; free months become that share of the yearly charge (3 free months = 3/12 off).</p>
          </fieldset>
        </div>
        <div className="grid gap-4 border-t border-outline-variant p-5 sm:grid-cols-2">
          <Field label="Status"><Select name="status" value={f.status} onChange={(e) => set("status", e.target.value as FormOffer["status"])} data-testid="f-status"><option value="draft">Draft (hidden)</option><option value="active">Active (live between the dates)</option><option value="paused">Paused</option></Select></Field>
          <div className="flex items-end"><Switch checked={f.showBanner} onChange={(v) => set("showBanner", v)} label="Show banner" hint="On the home, pricing and signup pages while live." /><input type="hidden" name="showBanner" value={f.showBanner ? "on" : ""} /></div>
        </div>
      </Card>

      <Card data-testid="offer-preview">
        <CardHeader title="Preview" subtitle="The banner on the public pages and what each plan costs with this offer (ex VAT, real plan prices)." />
        <div className="space-y-4 p-5">
          <div className="overflow-hidden rounded-shape-lg border border-outline-variant"><OfferBanner offer={bannerOffer} locale="en" preview /></div>
          <div className="overflow-hidden rounded-shape-lg border border-outline-variant" lang="ar"><OfferBanner offer={bannerOffer} locale="ar" preview /></div>
          <p className="text-sm" data-testid="preview-summary">{describeOffer(f)}{f.code ? ` with code ${f.code}` : ""}.</p>
          {f.kind === "trial_extension" ? <p className="text-sm text-on-surface-variant">Adds {f.value} days to the free trial. No change to prices.</p> : eligible.length === 0 ? <p className="text-sm text-on-surface-variant">No subscription plan matches the plan selection.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="preview-prices">
                <caption className="sr-only">Discounted prices by plan</caption>
                <thead><tr className="text-start text-xs text-on-surface-variant"><th scope="col" className="py-2 text-start">Plan</th><th scope="col" className="text-start">Cycle</th><th scope="col" className="text-start">List price</th><th scope="col" className="text-start">Discount</th><th scope="col" className="text-start">First payment</th><th scope="col" className="text-start">Total saved</th></tr></thead>
                <tbody>
                  {eligible.flatMap((p) => f.cycles.map((c) => {
                    const list = c === "yearly" ? p.priceYearly : p.priceMonthly;
                    const x = firstChargePrice(f, list, c);
                    const n = c === "yearly" ? 1 : months ?? null;
                    const total = c === "yearly" ? chargeDiscount(f, list, c) : n ? x.discount * n : null;
                    return (
                      <tr key={`${p.code}-${c}`} className="border-t border-outline-variant">
                        <th scope="row" className="py-2 text-start font-medium">{p.name}</th><td className="capitalize">{c}</td>
                        <td className="tabular-nums">{aed(list)}</td><td className="tabular-nums text-success">−{aed(x.discount)}</td>
                        <td className="font-semibold tabular-nums">{aed(x.discounted)}</td>
                        <td className="tabular-nums">{total == null ? "while they stay" : aed(total)}</td>
                      </tr>
                    );
                  }))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" disabled={pending} data-testid="save-offer">{pending ? "Saving…" : isNew ? "Create offer" : "Save changes"}</Button>
        <Link href="/superadmin/offers" className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline">Cancel</Link>
      </div>
    </form>
  );
}
