/** Pure grouping of queue rows into the sections shown on /admin/walk-in (unit-tested; no server imports). */
export type JobStatus = "awaiting_payment" | "queued" | "printing" | "printed" | "failed" | "cancelled" | "needs_manual";
export interface QueueRow {
  id: string; orderId: string; orderNumber: string; ticketNo: string; status: JobStatus; priority: number;
  filename: string; fileId: string; pages: number; copies: number; pagesVerified: boolean;
  options: { color: string; sides: string; paperSize: string }; printerName: string | null; attempts: number; error: string | null;
  queuedAt: string | null; startedAt: string | null; finishedAt: string | null; createdAt: string;
  customerName: string; customerPhone: string; paid: boolean;
}
export interface QueueSections { printing: QueueRow[]; upNext: QueueRow[]; attention: QueueRow[]; recent: QueueRow[]; awaiting: QueueRow[] }

const t = (s: string | null) => (s ? new Date(s).getTime() : Infinity);

/** Same ordering the agents use: priority desc, then queuedAt asc. */
export const queueSort = (a: QueueRow, b: QueueRow) => b.priority - a.priority || t(a.queuedAt) - t(b.queuedAt);

export function groupQueue(rows: QueueRow[]): QueueSections {
  const by = (...s: JobStatus[]) => rows.filter((r) => s.includes(r.status));
  return {
    printing: by("printing").sort((a, b) => t(a.startedAt) - t(b.startedAt)),
    upNext: by("queued").sort(queueSort),
    attention: by("needs_manual", "failed").sort((a, b) => t(b.finishedAt) - t(a.finishedAt)),
    recent: by("printed").sort((a, b) => t(b.finishedAt) - t(a.finishedAt)).slice(0, 20),
    awaiting: by("awaiting_payment").sort((a, b) => t(b.createdAt) - t(a.createdAt)),
  };
}

export const priorityLabel = (p: number) => (p >= 2 ? "Urgent" : p === 1 ? "High" : "Normal");
