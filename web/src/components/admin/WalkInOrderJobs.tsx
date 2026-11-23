"use client";
import { useRouter } from "next/navigation";
import { Badge, Card, CardHeader } from "@/components/ui";
import { priorityLabel } from "@/app/admin/walk-in/group";
import { WalkInJobActions } from "./WalkInJobActions";

export interface OrderJobView {
  id: string; filename: string; fileId: string; status: string; priority: number; pages: number; copies: number; pagesVerified: boolean;
  options: { color: string; sides: string; paperSize: string }; attempts: number; error: string | null; printerName: string | null;
}
const TONE: Record<string, "gray" | "green" | "yellow" | "red" | "blue" | "purple"> = {
  awaiting_payment: "yellow", queued: "blue", printing: "purple", printed: "green", failed: "red", needs_manual: "red", cancelled: "gray",
};

/** "Print jobs" card on a walk-in order's detail page. */
export function WalkInOrderJobs({ ticketNo, jobs }: { ticketNo: string | null; jobs: OrderJobView[] }) {
  const router = useRouter();
  return (
    <Card data-testid="order-print-jobs">
      <CardHeader title={`Print jobs${ticketNo ? ` · ticket ${ticketNo}` : ""}`} subtitle="Walk-in order — files print automatically once paid." />
      <ul className="divide-y">
        {jobs.map((j) => (
          <li key={j.id} className="space-y-2 px-5 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <a className="font-medium text-brand-600 hover:underline" href={`/api/v1/admin/files/${j.fileId}`}>{j.filename}</a>
                <p className="text-xs text-slate-500">{j.pages} pg × {j.copies} · {j.options.color === "color" ? "colour" : "B&W"} · {j.options.sides === "double" ? "2-sided" : "1-sided"} · {j.options.paperSize}{j.printerName ? ` · ${j.printerName}` : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                {!j.pagesVerified && <Badge tone="yellow">pages unverified</Badge>}
                <Badge tone={j.priority >= 2 ? "red" : j.priority === 1 ? "yellow" : "gray"}>{priorityLabel(j.priority)}</Badge>
                <Badge tone={TONE[j.status] ?? "gray"}>{j.status.replace(/_/g, " ")}</Badge>
              </div>
            </div>
            {(j.error || j.attempts > 1) && <p className="text-xs text-red-600">{j.error ?? ""}{j.attempts > 1 ? ` · ${j.attempts} attempts` : ""}</p>}
            <WalkInJobActions jobId={j.id} status={j.status} onDone={() => router.refresh()} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
