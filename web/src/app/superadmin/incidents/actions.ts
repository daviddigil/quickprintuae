"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSuperadmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { IncidentInput, createIncident, updateIncident } from "@/server/incidents";

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();
const nul = (fd: FormData, k: string) => str(fd, k) || null;

function parse(fd: FormData) {
  const n = str(fd, "affectedCount");
  return IncidentInput.safeParse({
    title: str(fd, "title"), summary: str(fd, "summary"), severity: str(fd, "severity"), status: str(fd, "status") || "open",
    detectedAt: str(fd, "detectedAt"), containedAt: str(fd, "containedAt"), resolvedAt: str(fd, "resolvedAt"),
    personalDataInvolved: fd.get("personalDataInvolved") === "on",
    dataCategories: str(fd, "dataCategories").split(",").map((s) => s.trim()).filter(Boolean),
    affectedTenantIds: fd.getAll("affectedTenantIds").map(String).filter(Boolean),
    affectedCount: n === "" ? null : Number(n), actionsTaken: nul(fd, "actionsTaken"), notificationDecision: nul(fd, "notificationDecision"),
    notifiedRegulatorAt: str(fd, "notifiedRegulatorAt"), notifiedSubjectsAt: str(fd, "notifiedSubjectsAt"),
  });
}

export async function saveIncident(fd: FormData) {
  const { user } = await requireSuperadmin();
  const id = str(fd, "id");
  const p = parse(fd);
  const back = id || "new";
  if (!p.success) redirect(`/superadmin/incidents?id=${back}&error=${encodeURIComponent(p.error.issues[0]?.message ?? "Check the form")}`);
  if (id) {
    const r = await updateIncident(id, p.data);
    if (!r.ok) redirect(`/superadmin/incidents?id=${id}&error=${encodeURIComponent(r.error)}`);
    await audit("incident.update", { incidentId: id, status: p.data.status, severity: p.data.severity, regulatorNotified: !!r.incident.notifiedRegulatorAt, subjectsNotified: !!r.incident.notifiedSubjectsAt }, null);
    revalidatePath("/superadmin/incidents");
    redirect(`/superadmin/incidents?id=${id}&ok=${encodeURIComponent("Incident saved")}`);
  }
  const row = await createIncident(p.data, user.id);
  await audit("incident.create", { incidentId: row.id, severity: row.severity, personalData: row.personalDataInvolved }, null);
  revalidatePath("/superadmin/incidents");
  redirect(`/superadmin/incidents?id=${row.id}&ok=${encodeURIComponent("Incident logged")}`);
}
