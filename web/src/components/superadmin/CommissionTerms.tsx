"use client";
import { useMemo, useState } from "react";
import { Button, Field, Input, cn } from "@/components/ui";
import { computeCommission, describeRule, resolveRule, type CommissionMode, type CommissionOverride, type PlanCommission } from "@/lib/commission";
import { saveCommissionTerms } from "@/app/superadmin/actions";

const MODES: { value: CommissionMode; title: string; text: string }[] = [
  { value: "plan", title: "Follow the plan", text: "Use the commission set on the shop's plan." },
  { value: "custom", title: "Custom rate", text: "Set this shop's own percentage, per-job fee and limits. Blank fields use the plan's values." },
  { value: "commission_only", title: "Commission only", text: "No subscription. The shop pays only commission (pilots, partners)." },
  { value: "subscription_only", title: "Subscription only", text: "The shop pays its subscription and no commission." },
  { value: "none", title: "No fees", text: "No subscription and no commission (internal or partner shops)." },
];
const aed = (n: number) => `AED ${n.toFixed(2)}`;

/** Superadmin control for one shop's commission terms with a live preview using the same engine that prices real orders. */
export function CommissionTerms({ tenantId, plan, planName, override }: { tenantId: string; plan: PlanCommission | null; planName: string; override: CommissionOverride | null }) {
  const [mode, setMode] = useState<CommissionMode>(override?.mode ?? "plan");
  const [f, setF] = useState({
    pct: override?.pct?.toString() ?? "", perJobFee: override?.perJobFee?.toString() ?? "", minOrderFee: override?.minOrderFee?.toString() ?? "",
    maxOrderFee: override?.maxOrderFee?.toString() ?? "", noCap: override?.maxOrderFee === null,
  });
  const n = (v: string) => (v.trim() === "" ? undefined : Number(v));
  const rule = useMemo(() => resolveRule(plan, mode === "plan" ? null : {
    mode, pct: n(f.pct), perJobFee: n(f.perJobFee), minOrderFee: n(f.minOrderFee), maxOrderFee: f.noCap ? null : n(f.maxOrderFee),
  } as CommissionOverride), [plan, mode, f]);
  const needsValues = mode === "custom" || mode === "commission_only";
  const samples: [number, number][] = [[50, 1], [200, 1], [1000, 5], [5000, 20]];

  return (
    <form action={saveCommissionTerms} className="space-y-5 p-5" data-testid="commission-form">
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="mode" value={mode} />
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Commission mode">
        {MODES.map((m) => (
          <button key={m.value} type="button" role="radio" aria-checked={mode === m.value} onClick={() => setMode(m.value)} data-testid={`mode-${m.value}`}
            className={cn("rounded-xl border p-3 text-start transition", mode === m.value ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900" : "border-slate-200 hover:bg-slate-50")}>
            <p className="text-sm font-semibold">{m.title}</p><p className="mt-0.5 text-xs text-slate-500">{m.text}</p>
          </button>
        ))}
      </div>

      {needsValues && (
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Commission %" hint={`(plan: ${plan?.orderFeePct ?? 0}%)`}><Input name="pct" type="number" step="0.01" min="0" max="30" value={f.pct} onChange={(e) => setF({ ...f, pct: e.target.value })} /></Field>
          <Field label="Per print job (AED)" hint={`(plan: ${plan?.perJobFee ?? 0})`}><Input name="perJobFee" type="number" step="0.01" min="0" max="100" value={f.perJobFee} onChange={(e) => setF({ ...f, perJobFee: e.target.value })} /></Field>
          <Field label="Min per order (AED)" hint={`(plan: ${plan?.minOrderFee ?? 0})`}><Input name="minOrderFee" type="number" step="0.01" min="0" value={f.minOrderFee} onChange={(e) => setF({ ...f, minOrderFee: e.target.value })} /></Field>
          <div>
            <Field label="Max per order (AED)" hint={`(plan: ${plan?.maxOrderFee ?? "no cap"})`}><Input name="maxOrderFee" type="number" step="0.01" min="0" value={f.maxOrderFee} disabled={f.noCap} onChange={(e) => setF({ ...f, maxOrderFee: e.target.value })} /></Field>
            <label className="mt-1 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" name="noCap" checked={f.noCap} onChange={(e) => setF({ ...f, noCap: e.target.checked })} /> No maximum</label>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" data-testid="commission-preview">
        <p className="text-sm font-semibold">Effective terms for this shop</p>
        <p className="mt-1 text-sm text-slate-700" data-testid="commission-effective">{describeRule(rule)}{planName ? <span className="text-slate-400"> · based on {planName}</span> : null}</p>
        <table className="mt-3 w-full text-sm tabular-nums">
          <thead className="text-xs text-slate-500"><tr><th className="py-1 text-start font-medium">Order value (ex VAT)</th><th className="py-1 text-start font-medium">Print jobs</th><th className="py-1 text-end font-medium">You earn</th><th className="py-1 text-end font-medium">Shop keeps</th></tr></thead>
          <tbody>{samples.map(([basis, jobs]) => { const fee = computeCommission(basis, jobs, rule).fee; return (
            <tr key={basis} className="border-t border-slate-200"><td className="py-1">{aed(basis)}</td><td className="py-1">{jobs}</td><td className="py-1 text-end font-medium">{aed(fee)}</td><td className="py-1 text-end text-slate-500">{aed(basis - fee)}</td></tr>); })}</tbody>
        </table>
      </div>

      <Field label="Internal note" hint="(why this shop has special terms; visible to superadmins only)"><Input name="note" maxLength={300} defaultValue={override?.note ?? ""} /></Field>
      <div className="flex flex-wrap items-center gap-3"><Button data-testid="save-commission">Save terms</Button><p className="text-xs text-slate-500">Applies to orders paid from now on. Orders already paid keep the terms they were paid under.</p></div>
    </form>
  );
}
