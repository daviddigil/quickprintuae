"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSuperadmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { REPORT_STATUSES } from "@/lib/compliance";
import { blockReportedCustomer, updateReport } from "@/server/reports";

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();
const go = (id: string, msg: string, err = false): never => redirect(`/superadmin/reports?id=${id}&${err ? "error" : "ok"}=${encodeURIComponent(msg)}`);

export async function saveReport(fd: FormData) {
  const { user } = await requireSuperadmin();
  const id = str(fd, "id"), status = str(fd, "status");
  if (!(REPORT_STATUSES as readonly string[]).includes(status)) go(id, "Unknown status", true);
  const r = await updateReport(id, { status, resolution: str(fd, "resolution") || null }, user.id);
  if (!r.ok) go(id, r.error, true);
  else {
    await audit("report.update", { reportId: id, from: r.before.status, to: status }, r.report.tenantId);
    revalidatePath("/superadmin/reports");
  }
  go(id, "Report updated");
}

export async function blockCustomer(fd: FormData) {
  const { user } = await requireSuperadmin();
  const id = str(fd, "id");
  const r = await blockReportedCustomer(id);
  if (!r.ok) go(id, r.error, true);
  else await audit("report.block_customer", { reportId: id, userId: r.userId, by: user.id }, r.tenantId);
  go(id, "Customer account blocked");
}
