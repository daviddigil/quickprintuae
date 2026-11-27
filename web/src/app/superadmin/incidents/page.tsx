import Link from "next/link";
import { db } from "@/db";
import { requireSuperadmin } from "@/lib/auth";
import { INCIDENT_SEVERITIES, INCIDENT_STATUSES } from "@/lib/compliance";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, LinkButton, Select, Table, Textarea } from "@/components/ui";
import { PageTitle, fmtDateTime } from "@/components/platform/PageTitle";
import { getIncident, listIncidents, notificationChecklist } from "@/server/incidents";
import { saveIncident } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Security incidents" };
const SEV = { low: "gray", medium: "yellow", high: "red", critical: "red" } as const;
/** value for <input type=datetime-local> */
const local = (d?: Date | null) => (d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

export default async function IncidentsPage({ searchParams }: { searchParams: Promise<{ id?: string; ok?: string; error?: string }> }) {
  await requireSuperadmin();
  const sp = await searchParams;
  const rows = await listIncidents();
  const isNew = sp.id === "new";
  const cur = !isNew && /^[0-9a-f-]{36}$/i.test(sp.id ?? "") ? await getIncident(sp.id!) : null;
  const tenants = isNew || cur ? await db.query.tenants.findMany({ columns: { id: true, name: true }, orderBy: (t, { asc }) => [asc(t.name)] }) : [];
  const checklist = cur ? notificationChecklist(cur) : [];
  return (
    <>
      <PageTitle title="Security incidents" subtitle="Register of security and personal-data incidents. Follow the incident steps in docs/RUNBOOKS.md (contain, assess, record). Whether the UAE Data Office and the affected people must be notified is decided with a lawyer; record the decision and the dates here." />
      {sp.error && <div className="mb-4"><Alert tone="red">{sp.error}</Alert></div>}
      {sp.ok && <div className="mb-4"><Alert tone="green">{sp.ok}</Alert></div>}
      <div className="mb-4"><LinkButton href="/superadmin/incidents?id=new">Log new incident</LinkButton></div>
      {(isNew || cur) && (
        <Card className="mb-6" data-testid="incident-form">
          <CardHeader title={cur ? `Incident: ${cur.title}` : "New incident"} />
          <form action={saveIncident} className="grid gap-4 px-5 pb-5 md:grid-cols-2">
            {cur && <input type="hidden" name="id" value={cur.id} />}
            <div className="md:col-span-2"><Field label="Title"><Input name="title" required maxLength={200} defaultValue={cur?.title} /></Field></div>
            <div className="md:col-span-2"><Field label="What happened"><Textarea name="summary" required rows={3} maxLength={5000} defaultValue={cur?.summary} /></Field></div>
            <Field label="Severity"><Select name="severity" defaultValue={cur?.severity ?? "medium"}>{INCIDENT_SEVERITIES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
            <Field label="Status"><Select name="status" defaultValue={cur?.status ?? "open"}>{INCIDENT_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
            <Field label="Detected"><Input type="datetime-local" name="detectedAt" defaultValue={local(cur?.detectedAt ?? new Date())} /></Field>
            <Field label="Contained" hint="(filled automatically when status changes)"><Input type="datetime-local" name="containedAt" defaultValue={local(cur?.containedAt)} /></Field>
            <Field label="Resolved"><Input type="datetime-local" name="resolvedAt" defaultValue={local(cur?.resolvedAt)} /></Field>
            <Field label="People affected (approx.)"><Input type="number" min={0} name="affectedCount" defaultValue={cur?.affectedCount ?? ""} /></Field>
            <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" name="personalDataInvolved" defaultChecked={cur?.personalDataInvolved} className="size-5" /> Personal data is involved</label>
            <div className="md:col-span-2"><Field label="Data categories" hint="(comma separated, e.g. names, emails, ID scans)"><Input name="dataCategories" defaultValue={cur?.dataCategories.join(", ")} /></Field></div>
            <div className="md:col-span-2"><Field label="Affected shops" hint="(hold Ctrl/Cmd to pick several)">
              <Select name="affectedTenantIds" multiple size={5} defaultValue={cur?.affectedTenantIds ?? []}>{tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field></div>
            <div className="md:col-span-2"><Field label="Actions taken"><Textarea name="actionsTaken" rows={3} maxLength={5000} defaultValue={cur?.actionsTaken ?? ""} /></Field></div>
            <fieldset className="space-y-3 rounded-shape-md border border-outline-variant p-4 md:col-span-2">
              <legend className="px-1 text-sm font-semibold">Notification checklist (decided with a lawyer)</legend>
              {cur && <ul className="text-sm" data-testid="incident-checklist">{checklist.map((c) => <li key={c.key}>{c.done ? "Done" : c.applies ? "To do" : "n/a"}: {c.label}</li>)}</ul>}
              <Field label="Decision and reasoning (notify the UAE Data Office / affected people, or why not)"><Textarea name="notificationDecision" rows={3} maxLength={3000} defaultValue={cur?.notificationDecision ?? ""} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="UAE Data Office notified at"><Input type="datetime-local" name="notifiedRegulatorAt" defaultValue={local(cur?.notifiedRegulatorAt)} /></Field>
                <Field label="Affected people notified at"><Input type="datetime-local" name="notifiedSubjectsAt" defaultValue={local(cur?.notifiedSubjectsAt)} /></Field>
              </div>
            </fieldset>
            <div className="md:col-span-2"><Button>{cur ? "Save incident" : "Log incident"}</Button></div>
          </form>
        </Card>
      )}
      <Card>
        {rows.length === 0 ? <EmptyState title="No incidents logged" /> : (
          <Table head={["Detected", "Title", "Severity", "Status", "Personal data", "Notified", ""]}>
            {rows.map((i) => (
              <tr key={i.id} data-testid="incident-row">
                <td className="px-4 py-3 text-xs">{fmtDateTime(i.detectedAt)}</td>
                <td className="px-4 py-3 font-medium">{i.title}</td>
                <td className="px-4 py-3"><Badge tone={SEV[i.severity as keyof typeof SEV] ?? "gray"}>{i.severity}</Badge></td>
                <td className="px-4 py-3 capitalize">{i.status}</td>
                <td className="px-4 py-3">{i.personalDataInvolved ? "Yes" : "No"}</td>
                <td className="px-4 py-3 text-xs">{i.notifiedRegulatorAt ? "Regulator " : ""}{i.notifiedSubjectsAt ? "People" : ""}{!i.notifiedRegulatorAt && !i.notifiedSubjectsAt ? "-" : ""}</td>
                <td className="px-4 py-3 text-end"><Link className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline" href={`/superadmin/incidents?id=${i.id}`}>Open</Link></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
