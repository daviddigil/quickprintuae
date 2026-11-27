import "server-only";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { INCIDENT_SEVERITIES, INCIDENT_STATUSES } from "@/lib/compliance";

export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];
export const INCIDENT_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = { open: ["contained", "resolved"], contained: ["resolved", "open"], resolved: ["open"] };
export const canMoveIncident = (from: string, to: string) => from === to || (INCIDENT_TRANSITIONS[from as IncidentStatus] ?? []).includes(to as IncidentStatus);

/** Timestamps implied by a status change: containing stamps containedAt, resolving stamps both (if missing), reopening clears resolvedAt. */
export function statusTimestamps(from: { status: string; containedAt: Date | null; resolvedAt: Date | null }, to: string, now = new Date()) {
  if (!canMoveIncident(from.status, to)) return null;
  const out: { containedAt: Date | null; resolvedAt: Date | null } = { containedAt: from.containedAt, resolvedAt: from.resolvedAt };
  if (to === "contained") { out.containedAt ??= now; out.resolvedAt = null; }
  if (to === "resolved") { out.containedAt ??= now; out.resolvedAt ??= now; }
  if (to === "open") { out.containedAt = null; out.resolvedAt = null; }
  return out;
}

/**
 * Notification checklist. Whether notifying the regulator (UAE Data Office) / people is legally required is a decision for a
 * lawyer; this only reports what is still undecided or undone.
 */
export function notificationChecklist(i: { personalDataInvolved: boolean; notificationDecision: string | null; notifiedRegulatorAt: Date | null; notifiedSubjectsAt: Date | null }) {
  return [
    { key: "decision", label: "Notification decision recorded (with reasoning)", done: !!i.notificationDecision?.trim(), applies: i.personalDataInvolved },
    { key: "regulator", label: "UAE Data Office notified (if required)", done: !!i.notifiedRegulatorAt, applies: i.personalDataInvolved },
    { key: "subjects", label: "Affected people notified (if required)", done: !!i.notifiedSubjectsAt, applies: i.personalDataInvolved },
  ];
}

const dt = z.string().trim().optional().transform((v) => (v ? new Date(v) : null)).refine((d) => d === null || !Number.isNaN(d.getTime()), "Invalid date");
export const IncidentInput = z.object({
  title: z.string().trim().min(3).max(200),
  summary: z.string().trim().min(3).max(5000),
  severity: z.enum(INCIDENT_SEVERITIES),
  status: z.enum(INCIDENT_STATUSES).default("open"),
  detectedAt: dt, containedAt: dt, resolvedAt: dt,
  personalDataInvolved: z.boolean(),
  dataCategories: z.array(z.string().trim().min(1).max(60)).max(30),
  affectedTenantIds: z.array(z.string().uuid()).max(500),
  affectedCount: z.number().int().min(0).nullable(),
  actionsTaken: z.string().trim().max(5000).nullable(),
  notificationDecision: z.string().trim().max(3000).nullable(),
  notifiedRegulatorAt: dt, notifiedSubjectsAt: dt,
});
export type IncidentData = z.infer<typeof IncidentInput>;

export const listIncidents = () => db.select().from(schema.securityIncidents).orderBy(desc(schema.securityIncidents.detectedAt));
export const getIncident = (id: string) => db.query.securityIncidents.findFirst({ where: eq(schema.securityIncidents.id, id) });

export async function createIncident(d: IncidentData, createdBy: string) {
  const [r] = await db.insert(schema.securityIncidents).values({ ...d, detectedAt: d.detectedAt ?? new Date(), createdBy }).returning();
  return r;
}

export async function updateIncident(id: string, d: IncidentData) {
  const cur = await getIncident(id);
  if (!cur) return { ok: false as const, error: "Incident not found" };
  const ts = statusTimestamps(cur, d.status);
  if (!ts) return { ok: false as const, error: `Cannot move from ${cur.status} to ${d.status}` };
  const [r] = await db.update(schema.securityIncidents).set({
    ...d, detectedAt: d.detectedAt ?? cur.detectedAt,
    containedAt: d.containedAt ?? ts.containedAt, resolvedAt: d.resolvedAt ?? ts.resolvedAt, updatedAt: new Date(),
  }).where(eq(schema.securityIncidents.id, id)).returning();
  return { ok: true as const, incident: r };
}
