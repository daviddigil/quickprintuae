import { describeRule, resolveRule } from "@/lib/commission";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Plan } from "@/db/schema";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Textarea } from "@/components/ui";
import { PageTitle } from "@/components/platform/PageTitle";
import { PLAN_FLAGS, flagLabel } from "@/server/billing/flags";
import { USAGE_KINDS } from "@/lib/usage";
import { savePlan } from "../actions";

export const dynamic = "force-dynamic";

function PlanForm({ plan }: { plan?: Plan }) {
  return (
    <form action={savePlan} className="grid gap-3 px-5 py-4 sm:grid-cols-4">
      {plan && <input type="hidden" name="id" value={plan.id} />}
      <Field label="Billing model" hint="(how shops on this plan pay)">
        <select name="billingModel" defaultValue={plan?.billingModel ?? "subscription"} className="w-full rounded-lg border border-outline-variant px-3 py-2 text-sm">
          <option value="subscription">Monthly subscription (no commission)</option>
          <option value="commission">Commission per order (no monthly fee)</option>
        </select>
      </Field>
      <Field label="Code"><Input name="code" defaultValue={plan?.code} required /></Field>
      <Field label="Name"><Input name="name" defaultValue={plan?.name} required /></Field>
      <Field label="AED / month"><Input name="priceMonthly" type="number" step="0.01" defaultValue={plan?.priceMonthly ?? 0} /></Field>
      <Field label="AED / year"><Input name="priceYearly" type="number" step="0.01" defaultValue={plan?.priceYearly ?? 0} /></Field>
      <Field label="Commission %" hint="(of order value, ex VAT)"><Input name="orderFeePct" type="number" step="0.01" defaultValue={plan?.orderFeePct ?? 0} /></Field>
      <Field label="Per print job (AED)" hint="(optional flat fee)"><Input name="perJobFee" type="number" step="0.01" min="0" defaultValue={plan?.perJobFee ?? 0} /></Field>
      <Field label="Min per order (AED)"><Input name="minOrderFee" type="number" step="0.01" min="0" defaultValue={plan?.minOrderFee ?? 0} /></Field>
      <Field label="Max per order (AED)" hint="(blank = no cap)"><Input name="maxOrderFee" type="number" step="0.01" min="0" defaultValue={plan?.maxOrderFee ?? ""} /></Field>
      <Field label="Max orders / mo" hint="(blank = ∞)"><Input name="maxOrdersPerMonth" type="number" defaultValue={plan?.maxOrdersPerMonth ?? ""} /></Field>
      <Field label="Max staff" hint="(blank = ∞)"><Input name="maxStaff" type="number" defaultValue={plan?.maxStaff ?? ""} /></Field>
      <Field label="Sort"><Input name="sortOrder" type="number" defaultValue={plan?.sortOrder ?? 0} /></Field>
      <div className="sm:col-span-3"><Field label="Features (one per line)"><Textarea name="features" rows={4} defaultValue={plan?.features.join("\n")} /></Field></div>
      <fieldset className="sm:col-span-4 rounded-lg border border-outline-variant p-3">
        <legend className="px-1 text-sm font-medium text-on-surface-variant">Free usage included per month</legend>
        <div className="grid gap-3 sm:grid-cols-4">
          {USAGE_KINDS.map((k) => (
            <Field key={k.kind} label={k.label}><Input name={`inc_${k.kind}`} type="number" min="0" defaultValue={plan?.includedUsage?.[k.kind] ?? 0} /></Field>
          ))}
        </div>
      </fieldset>
      <fieldset className="sm:col-span-4 rounded-lg border border-outline-variant p-3" data-testid={`flags-${plan?.code ?? "new"}`}>
        <legend className="px-1 text-sm font-medium text-on-surface-variant">Feature flags</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {PLAN_FLAGS.map((f) => (
            <label key={f.key} className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="flags" value={f.key} defaultChecked={plan?.flags?.includes(f.key)} className="mt-1" />
              <span><b>{f.label}</b><span className="block text-xs text-on-surface-variant">{f.description}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col justify-end gap-3 sm:col-span-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={plan?.active ?? true} /> Active (shown on pricing)</label>
        <Button>{plan ? "Save" : "Create plan"}</Button>
      </div>
    </form>
  );
}

export default async function PlansPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { saved, error } = await searchParams;
  const plans = await db.query.plans.findMany({ orderBy: asc(schema.plans.sortOrder) });
  return (
    <>
      <PageTitle title="Subscription plans" subtitle="Prices in AED excl. VAT. Order fee is charged on each shop's paid GMV." />
      {saved && <div className="mb-4"><Alert tone="green">Plan saved.</Alert></div>}
      {error && <div className="mb-4"><Alert>{error === "flags" ? "Unknown feature flag." : "Code and name are required."}</Alert></div>}
      <div className="space-y-6">
        {plans.map((p) => (
          <Card key={p.id}>
            <CardHeader title={<span className="flex items-center gap-2">{p.name} {!p.active && <Badge>inactive</Badge>}{p.flags?.map((f) => <Badge key={f} tone="purple">{flagLabel(f)}</Badge>)}</span>} subtitle={`AED ${p.priceMonthly}/mo · ${describeRule(resolveRule(p))}`} />
            <PlanForm plan={p} />
          </Card>
        ))}
        <Card>
          <CardHeader title="New plan" />
          <PlanForm />
        </Card>
      </div>
    </>
  );
}
