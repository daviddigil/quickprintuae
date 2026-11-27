"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { DSR_STATUSES } from "@/lib/compliance";
import { eraseCustomer, updateDataSubjectRequest } from "@/server/privacy";

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();
const go = (msg: string, err = false): never => redirect(`/admin/privacy-requests?${err ? "error" : "ok"}=${encodeURIComponent(msg)}`);

export async function saveRequest(fd: FormData) {
  const { tenant, user } = await requireStaff({ ownerOnly: true });
  const status = str(fd, "status"), id = str(fd, "id");
  if (!(DSR_STATUSES as readonly string[]).includes(status)) go("Unknown status", true);
  const r = await updateDataSubjectRequest(id, { tenantId: tenant.id }, { status, resolution: str(fd, "resolution") || null }, user.id);
  if (!r.ok) go(r.error, true);
  else { await audit("privacy.request.update", { requestId: id, kind: r.request.kind, from: r.before.status, to: status }, tenant.id); revalidatePath("/admin/privacy-requests"); }
  go("Request updated");
}

export async function eraseNow(fd: FormData) {
  const { tenant, user } = await requireStaff({ ownerOnly: true });
  const id = str(fd, "id");
  const req = await db.query.dataSubjectRequests.findFirst({ where: and(eq(schema.dataSubjectRequests.id, id), eq(schema.dataSubjectRequests.tenantId, tenant.id)) });
  if (!req || req.kind !== "erasure" || !req.userId) go("Erasure request not found", true);
  else {
    const res = await eraseCustomer(tenant.id, req.userId);
    if (!res.ok) {
      await audit("privacy.erase.refused", { requestId: id, userId: req.userId, reason: res.reason }, tenant.id);
      go(res.reason === "legal_hold" ? "Refused: a legal hold applies to this shop or to the customer's orders. Tax and dispute records must be kept." : "Customer not found", true);
    } else {
      await audit("privacy.erase", { requestId: id, userId: req.userId, filesDeleted: res.filesDeleted, ordersAnonymised: res.ordersAnonymised, alreadyErased: res.alreadyErased }, tenant.id);
      if (req.status !== "completed") {
        await updateDataSubjectRequest(id, { tenantId: tenant.id }, { status: "completed", resolution: `Personal data erased on ${new Date().toISOString().slice(0, 10)}. Order and invoice records were kept as the law requires, with personal details removed.` }, user.id);
      }
      revalidatePath("/admin/privacy-requests");
    }
  }
  go("Customer data erased (financial records kept)");
}
