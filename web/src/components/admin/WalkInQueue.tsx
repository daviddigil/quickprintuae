"use client";
import { useCallback, useEffect, useState } from "react";
import { Download, TriangleAlert } from "lucide-react";
import { Badge, Card, CardHeader, Stat } from "@/components/ui";
import { formatAED } from "@/lib/pricing";
import { priorityLabel, type QueueRow } from "@/app/admin/walk-in/group";
import type { WalkInQueueData } from "@/app/admin/walk-in/data";
import { WalkInJobActions } from "./WalkInJobActions";

const STATUS: Record<string, { label: string; tone: "gray" | "green" | "yellow" | "red" | "blue" | "purple" }> = {
  awaiting_payment: { label: "Awaiting payment", tone: "yellow" }, queued: { label: "Queued", tone: "blue" }, printing: { label: "Printing", tone: "purple" },
  printed: { label: "Printed", tone: "green" }, failed: { label: "Failed", tone: "red" }, needs_manual: { label: "Needs manual print", tone: "red" }, cancelled: { label: "Cancelled", tone: "gray" },
};
const waLink = (phone: string, text: string) => `https://wa.me/${phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(text)}`;
const mins = (iso: string | null, now: number) => (iso ? Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000)) : null);
const waitLabel = (m: number | null) => (m === null ? "—" : m < 1 ? "<1 min" : m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`);

export function WalkInQueue({ initial }: { initial: WalkInQueueData }) {
  const [data, setData] = useState(initial);
  const [now, setNow] = useState(() => Date.now());
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/admin/walk-in/queue", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json()); setOffline(false);
    } catch { setOffline(true); }
    setNow(Date.now());
  }, []);

  useEffect(() => {
    const iv = setInterval(refresh, 4000);
    const vis = () => document.visibilityState === "visible" && refresh();
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(iv); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", vis); };
  }, [refresh]);

  const { stats, sections: s } = data;
  return (
    <div className="space-y-6" data-testid="walkin-queue">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Waiting" value={<span data-testid="stat-waiting">{stats.waiting}</span>} sub={stats.attention ? `${stats.attention} need attention` : "in queue"} />
        <Stat label="Printing now" value={<span data-testid="stat-printing">{stats.printing}</span>} />
        <Stat label="Printed today" value={<span data-testid="stat-printed">{stats.printedToday}</span>} sub="files" />
        <Stat label="Walk-in revenue today" value={formatAED(stats.revenueToday)} sub={`${stats.ordersToday} paid order${stats.ordersToday === 1 ? "" : "s"} · incl. VAT`} />
      </div>
      {offline && <p className="text-sm text-warning">Connection lost — retrying…</p>}

      <Section title="Printing now" rows={s.printing} now={now} onDone={refresh} empty="Nothing printing right now." testid="sec-printing" />
      <Section title="Up next" rows={s.upNext} now={now} onDone={refresh} empty="The queue is empty. New paid jobs appear here in print order." testid="sec-next" showPosition />
      {s.attention.length > 0 && <Section title="Needs attention" rows={s.attention} now={now} onDone={refresh} tone="red" testid="sec-attention" />}
      {s.awaiting.length > 0 && <Section title="Awaiting payment" rows={s.awaiting} now={now} onDone={refresh} testid="sec-awaiting" subtitle="Files are held back until the customer pays." />}
      <Section title="Recently printed" rows={s.recent} now={now} onDone={refresh} empty="Nothing printed yet today." testid="sec-recent" />
    </div>
  );
}

function Section({ title, subtitle, rows, now, onDone, empty, tone, testid, showPosition }: {
  title: string; subtitle?: string; rows: QueueRow[]; now: number; onDone: () => void; empty?: string; tone?: "red"; testid: string; showPosition?: boolean;
}) {
  return (
    <Card data-testid={testid} className={tone === "red" ? "border-critical/40" : ""}>
      <CardHeader title={<span className="flex items-center gap-2">{tone === "red" && <TriangleAlert size={16} className="text-critical" />}{title} <span className="text-sm font-normal text-outline">({rows.length})</span></span>} subtitle={subtitle} />
      {rows.length === 0 ? <p className="px-5 py-6 text-sm text-on-surface-variant">{empty ?? "None."}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-surface-low text-xs uppercase text-on-surface-variant"><tr>
              {[showPosition ? "#" : "", "Ticket", "Customer", "File", "Priority", "Status", "Paid", "Wait", "Printer", ""].map((h, i) => <th key={i} className="px-3 py-2.5 font-medium">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-outline-variant">
              {rows.map((r, i) => <Row key={r.id} r={r} idx={showPosition ? i + 1 : null} now={now} onDone={onDone} />)}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Row({ r, idx, now, onDone }: { r: QueueRow; idx: number | null; now: number; onDone: () => void }) {
  const st = STATUS[r.status];
  const wait = r.status === "printed" ? null : mins(r.queuedAt ?? r.createdAt, now);
  return (
    <tr data-job={r.id} data-status={r.status} className="align-top hover:bg-surface-low">
      <td className="px-3 py-3 text-outline">{idx ?? ""}</td>
      <td className="px-3 py-3"><a className="font-semibold text-primary" href={`/admin/orders/${r.orderId}`}>{r.ticketNo}</a><div className="text-xs text-outline">{r.orderNumber}</div></td>
      <td className="px-3 py-3"><div className="font-medium">{r.customerName}</div>
        <a className="text-xs text-success hover:underline" target="_blank" rel="noopener noreferrer" href={waLink(r.customerPhone, `Hi ${r.customerName}, this is about your print job ${r.ticketNo}.`)}>{r.customerPhone}</a></td>
      <td className="px-3 py-3">
        <div className="max-w-[16rem] truncate font-medium" title={r.filename}>{r.filename}</div>
        <div className="text-xs text-on-surface-variant">{r.pages} pg × {r.copies} · {r.options.color === "color" ? "colour" : "B&W"} · {r.options.sides === "double" ? "2-sided" : "1-sided"} · {r.options.paperSize}</div>
        {!r.pagesVerified && <Badge tone="yellow">pages unverified</Badge>}
        {r.error && <div className="mt-1 max-w-[16rem] text-xs text-critical">{r.error}{r.attempts > 1 ? ` (attempt ${r.attempts})` : ""}</div>}
      </td>
      <td className="px-3 py-3"><Badge tone={r.priority >= 2 ? "red" : r.priority === 1 ? "yellow" : "gray"}>{priorityLabel(r.priority)}</Badge></td>
      <td className="px-3 py-3"><Badge tone={st.tone}>{st.label}</Badge></td>
      <td className="px-3 py-3">{r.paid ? <span className="font-semibold text-success" title="Paid">✓</span> : <span className="text-warning">—</span>}</td>
      <td className="px-3 py-3 text-xs text-on-surface-variant">{waitLabel(wait)}</td>
      <td className="px-3 py-3 text-xs text-on-surface-variant">{r.printerName ?? "—"}</td>
      <td className="px-3 py-3">
        <div className="flex flex-col gap-1.5">
          <WalkInJobActions jobId={r.id} status={r.status} onDone={onDone} />
          <a className="inline-flex items-center gap-1 text-xs font-medium text-on-surface-variant hover:underline" href={`/api/v1/admin/files/${r.fileId}`}><Download size={13} />Download file</a>
        </div>
      </td>
    </tr>
  );
}
