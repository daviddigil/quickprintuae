"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSuperadmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { DSR_STATUSES } from "@/lib/compliance";
import { updateDataSubjectRequest } from "@/server/privacy";

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();
const go = (msg: string, err = false): never => redirect(`/superadmin/privacy-requests?${err ? "error" : "ok"}=${encodeURIComponent(msg)}`);

export async function savePlatformRequest(fd: FormData) {
  const { user } = await requireSuperadmin();
  const id = str(fd, "id"), status = str(fd, "status");
  if (!(DSR_STATUSES as readonly string[]).includes(status)) go("Unknown status", true);
  const r = await updateDataSubjectRequest(id, { tenantId: null }, { status, resolution: str(fd, "resolution") || null }, user.id);
  if (!r.ok) go(r.error, true);
  else { await audit("privacy.platform_request.update", { requestId: id, kind: r.request.kind, from: r.before.status, to: status }, null); revalidatePath("/superadmin/privacy-requests"); }
  go("Request updated");
}
