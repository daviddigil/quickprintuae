import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Plan } from "@/db/schema";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Textarea } from "@/components/ui";
import { PageTitle } from "@/components/platform/PageTitle";
import { savePlan } from "../actions";

export const dynamic = "force-dynamic";

function PlanForm({ plan }: { plan?: Plan }) {
  return (
    <form action={savePlan} className="grid gap-3 px-5 py-4 sm:grid-cols-4">
      {plan && <input type="hidden" name="id" value={plan.id} />}
      <Field label="Code"><Input name="code" defaultValue={plan?.code} required /></Field>
      <Field label="Name"><Input name="name" defaultValue={plan?.name} required /></Field>
      <Field label="AED / month"><Input name="priceMonthly" type="number" step="0.01" defaultValue={plan?.priceMonthly ?? 0} /></Field>
      <Field label="AED / year"><Input name="priceYearly" type="number" step="0.01" defaultValue={plan?.priceYearly ?? 0} /></Field>
      <Field label="Order fee %"><Input name="orderFeePct" type="number" step="0.01" defaultValue={plan?.orderFeePct ?? 0} /></Field>
      <Field label="Max orders / mo" hint="(blank = ∞)"><Input name="maxOrdersPerMonth" type="number" defaultValue={plan?.maxOrdersPerMonth ?? ""} /></Field>
      <Field label="Max staff" hint="(blank = ∞)"><Input name="maxStaff" type="number" defaultValue={plan?.maxStaff ?? ""} /></Field>
      <Field label="Sort"><Input name="sortOrder" type="number" defaultValue={plan?.sortOrder ?? 0} /></Field>
      <div className="sm:col-span-3"><Field label="Features (one per line)"><Textarea name="features" rows={4} defaultValue={plan?.features.join("\n")} /></Field></div>
      <div className="flex flex-col justify-end gap-3">
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
      {error && <div className="mb-4"><Alert>Code and name are required.</Alert></div>}
      <div className="space-y-6">
        {plans.map((p) => (
          <Card key={p.id}>
            <CardHeader title={<span className="flex items-center gap-2">{p.name} {!p.active && <Badge>inactive</Badge>}</span>} subtitle={`AED ${p.priceMonthly}/mo · ${p.orderFeePct}% per order`} />
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
