"use client";
import { useState } from "react";
import { ChevronsUp, RotateCcw, Printer, X } from "lucide-react";
import { Button } from "@/components/ui";

export type JobAction = "bump" | "cancel" | "reprint" | "mark_printed";
const BTN: Record<JobAction, { label: string; icon: React.ReactNode; danger?: boolean }> = {
  bump: { label: "Move to top", icon: <ChevronsUp size={14} /> },
  reprint: { label: "Reprint", icon: <RotateCcw size={14} /> },
  mark_printed: { label: "Mark printed", icon: <Printer size={14} /> },
  cancel: { label: "Cancel", icon: <X size={14} />, danger: true },
};
/** which actions make sense for which job status (server enforces the same rules) */
export const ACTIONS_FOR: Record<string, JobAction[]> = {
  awaiting_payment: ["cancel"], queued: ["bump", "mark_printed", "cancel"], printing: ["mark_printed"],
  printed: ["reprint"], failed: ["reprint", "mark_printed", "cancel"], needs_manual: ["reprint", "mark_printed", "cancel"], cancelled: [],
};

/** Buttons that POST to /api/v1/admin/walk-in/jobs/[id]. `onDone` refreshes the surrounding view. */
export function WalkInJobActions({ jobId, status, onDone }: { jobId: string; status: string; onDone: () => void }) {
  const [busy, setBusy] = useState<JobAction | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function run(a: JobAction) {
    if (a === "cancel" && !confirm("Cancel this print job? The customer's payment is not refunded automatically.")) return;
    setBusy(a); setErr(null);
    const res = await fetch(`/api/v1/admin/walk-in/jobs/${jobId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: a }) });
    if (!res.ok) setErr((await res.json().catch(() => ({}))).error ?? "Failed");
    setBusy(null); onDone();
  }
  const acts = ACTIONS_FOR[status] ?? [];
  if (!acts.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {acts.map((a) => (
        <Button key={a} type="button" variant={BTN[a].danger ? "ghost" : "secondary"} className={`px-2.5 py-1 text-xs ${BTN[a].danger ? "text-red-600" : ""}`} disabled={!!busy} onClick={() => run(a)} data-action={a}>
          {BTN[a].icon}{busy === a ? "…" : BTN[a].label}
        </Button>
      ))}
      {err && <span className="text-xs text-red-600">{err}</span>}
    </div>
  );
}
