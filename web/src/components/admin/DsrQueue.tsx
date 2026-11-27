import { Badge, Button, Card, EmptyState, Select, Table, Textarea } from "@/components/ui";
import { fmtDateTime } from "@/components/platform/PageTitle";
import { isDsrOverdue } from "@/lib/dsr";
import type { DataSubjectRequest } from "@/db/schema";

const TONE = { requested: "blue", in_progress: "yellow", completed: "green", rejected: "gray" } as const;

/** Table of data-subject requests with due date, overdue badge and a status/resolution form per row. Shared by the shop inbox and the superadmin queue. */
export function DsrQueue({ rows, save, erase, exportHref }: {
  rows: (DataSubjectRequest & { shop?: string | null })[];
  save: (fd: FormData) => Promise<void>;
  /** shop inbox only: "Erase now" for erasure requests from a customer */
  erase?: (fd: FormData) => Promise<void>;
  exportHref?: (id: string) => string;
}) {
  if (rows.length === 0) return <Card><EmptyState title="No requests" /></Card>;
  return (
    <Card>
      <Table head={["Received", "Requester", "Kind", "Due", "Status", "Handle"]}>
        {rows.map((r) => {
          const overdue = isDsrOverdue(r);
          const closed = r.status === "completed" || r.status === "rejected";
          return (
            <tr key={r.id} data-testid="dsr-row" className="align-top">
              <td className="px-4 py-3 text-xs">{fmtDateTime(r.createdAt)}</td>
              <td className="px-4 py-3">{r.requesterEmail}{r.shop ? <div className="text-xs text-on-surface-variant">{r.shop}</div> : null}{r.note ? <div className="mt-1 max-w-xs whitespace-pre-wrap text-xs text-on-surface-variant">{r.note}</div> : null}</td>
              <td className="px-4 py-3 capitalize">{r.kind}</td>
              <td className="px-4 py-3 text-xs">{fmtDateTime(r.dueAt)} {overdue && <Badge tone="red">Overdue</Badge>}</td>
              <td className="px-4 py-3"><Badge tone={TONE[r.status as keyof typeof TONE] ?? "gray"}>{r.status.replace("_", " ")}</Badge></td>
              <td className="px-4 py-3">
                {closed ? <p className="max-w-xs text-xs text-on-surface-variant">{r.resolution}</p> : (
                  <div className="space-y-2">
                    <form action={save} className="space-y-2">
                      <input type="hidden" name="id" value={r.id} />
                      <Select name="status" aria-label="Status" defaultValue={r.status}>
                        {["requested", "in_progress", "completed", "rejected"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                      </Select>
                      <Textarea name="resolution" aria-label="Resolution" rows={2} maxLength={2000} placeholder="Resolution (required to complete or reject)" defaultValue={r.resolution ?? ""} />
                      <Button size="sm">Save</Button>
                    </form>
                    {exportHref && r.kind === "access" && r.userId && <a className="inline-flex min-h-9 items-center text-xs font-semibold text-primary underline" href={exportHref(r.id)}>Download data export (JSON)</a>}
                    {erase && r.kind === "erasure" && r.userId && (
                      <form action={erase}><input type="hidden" name="id" value={r.id} /><Button size="sm" variant="danger">Erase now</Button></form>
                    )}
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </Table>
    </Card>
  );
}
