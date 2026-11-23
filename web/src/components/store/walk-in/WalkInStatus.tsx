"use client";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, CreditCard, FileText, Loader2, Printer } from "lucide-react";
import { Badge, Button, Card, cn } from "@/components/ui";
import { formatAED } from "@/lib/pricing";

export interface StatusJob { id: string; filename: string; status: string; pages: number; copies: number; error: string | null; ahead: number | null }
export interface StatusData { state: string; ticketNo: string | null; total: number; jobs: StatusJob[] }

const JOB_LABEL: Record<string, { t: string; tone: "gray" | "blue" | "purple" | "green" | "red" | "yellow" }> = {
  awaiting_payment: { t: "Awaiting payment", tone: "yellow" }, queued: { t: "In queue", tone: "blue" }, printing: { t: "Printing", tone: "purple" },
  printed: { t: "Printed", tone: "green" }, failed: { t: "Problem", tone: "red" }, needs_manual: { t: "Staff will print", tone: "yellow" }, cancelled: { t: "Cancelled", tone: "gray" },
};

export function WalkInStatus({ store, orderId, token, providers, initial, shopName }: {
  store: string; orderId: string; token: string; providers: ("stripe" | "mamo")[]; initial: StatusData; shopName: string;
}) {
  const [data, setData] = useState<StatusData>(initial);
  const [payBusy, setPayBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const done = data.state === "ready" || data.state === "cancelled";

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/store/${store}/walk-in/orders/${orderId}/status?t=${encodeURIComponent(token)}`, { cache: "no-store" });
      if (res.ok) { const j = await res.json(); setData({ state: j.state, ticketNo: j.ticketNo, total: j.total, jobs: j.jobs }); }
    } catch { /* offline: keep showing the last state */ }
  }, [store, orderId, token]);

  useEffect(() => {
    if (done) return;
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [done, refresh]);

  async function pay(provider: "stripe" | "mamo") {
    setPayBusy(true); setErr(null);
    const res = await fetch(`/api/v1/store/${store}/walk-in/orders/${orderId}/pay`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider, t: token }) });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.url) { window.location.href = j.url; return; }
    setPayBusy(false); setErr(j.error ?? "Could not open the payment page.");
  }

  const ahead = Math.min(...data.jobs.filter((j) => j.ahead != null).map((j) => j.ahead as number));
  const card = {
    awaiting_payment: { icon: CreditCard, tone: "bg-amber-50 border-amber-200 text-amber-900", title: "Payment needed", sub: "Pay to put your files in the print queue." },
    waiting: { icon: Clock, tone: "bg-sky-50 border-sky-200 text-sky-900", title: `Waiting — ${Number.isFinite(ahead) ? ahead : 0} ahead of you`, sub: ahead === 0 ? "You're next in line." : "We'll print as soon as it's your turn. Keep this page open." },
    printing: { icon: Printer, tone: "bg-violet-50 border-violet-200 text-violet-900", title: "Printing now", sub: "Your documents are being printed." },
    ready: { icon: CheckCircle2, tone: "bg-emerald-50 border-emerald-200 text-emerald-900", title: "Ready — collect at the counter", sub: `Show ticket ${data.ticketNo ?? ""} to the staff.` },
    needs_attention: { icon: AlertTriangle, tone: "bg-amber-50 border-amber-200 text-amber-900", title: "Needs attention — please see the staff", sub: "One of your files needs a hand. The staff will help you at the counter." },
    cancelled: { icon: AlertTriangle, tone: "bg-slate-50 border-slate-200 text-slate-700", title: "Cancelled", sub: "This order was cancelled. Please ask the staff if this is a mistake." },
  }[data.state] ?? { icon: Clock, tone: "bg-slate-50 border-slate-200 text-slate-700", title: "Checking…", sub: "" };
  const Icon = card.icon;

  return (
    <div className="mx-auto max-w-md px-4 py-6" data-testid="walk-in-status">
      <p className="text-center text-sm text-slate-500">{shopName}</p>
      <div className="mt-2 rounded-2xl bg-store-soft py-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Your ticket</p>
        <p className="text-5xl font-extrabold tracking-tight text-store" data-testid="ticket-no">{data.ticketNo ?? "—"}</p>
      </div>

      <div className={cn("mt-4 flex gap-3 rounded-xl border p-4", card.tone)} data-testid="status-card" data-state={data.state}>
        <Icon className="mt-0.5 h-6 w-6 shrink-0" />
        <div><p className="font-semibold" data-testid="status-title">{card.title}</p><p className="mt-0.5 text-sm opacity-90">{card.sub}</p></div>
      </div>

      {data.state === "awaiting_payment" && providers.length > 0 && (
        <div className="mt-4 space-y-2">
          {providers.map((p) => (
            <Button key={p} variant="store" className="w-full py-3" disabled={payBusy} onClick={() => pay(p)} data-testid={`pay-${p}`}>
              {payBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              Pay {formatAED(data.total)}{providers.length > 1 ? ` · ${p === "stripe" ? "Card / Apple Pay" : "Mamo Pay"}` : ""}
            </Button>
          ))}
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
      )}

      <Card className="mt-4 divide-y divide-slate-100">
        {data.jobs.map((j) => {
          const l = JOB_LABEL[j.status] ?? { t: j.status, tone: "gray" as const };
          return (
            <div key={j.id} className="flex items-center gap-3 p-3" data-testid="status-file">
              <FileText className="h-5 w-5 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{j.filename}</p><p className="text-xs text-slate-500">{j.pages} page{j.pages > 1 ? "s" : ""} × {j.copies}</p></div>
              <Badge tone={l.tone}>{l.t}</Badge>
            </div>
          );
        })}
      </Card>
      {!done && <p className="mt-3 text-center text-xs text-slate-400">This page updates automatically.</p>}
    </div>
  );
}
