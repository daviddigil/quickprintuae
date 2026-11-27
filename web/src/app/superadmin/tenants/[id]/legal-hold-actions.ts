"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSuperadmin } from "@/lib/auth";
import { audit } from "@/lib/audit";

/** Superadmin only: turns the legal hold on/off for a shop. While on, no purge job deletes any of the shop's files. Audited. */
export async function setTenantLegalHold(fd: FormData) {
  const { user } = await requireSuperadmin();
  const id = String(fd.get("tenantId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/superadmin/tenants");
  const hold = fd.get("hold") === "1";
  const reason = String(fd.get("reason") ?? "").trim().slice(0, 300);
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, id) });
  if (!t) redirect("/superadmin/tenants");
  if (t.legalHold !== hold) {
    await db.update(schema.tenants).set({ legalHold: hold }).where(eq(schema.tenants.id, id));
    await audit(hold ? "tenant.legal_hold_on" : "tenant.legal_hold_off", { reason, by: user.id }, id);
  }
  revalidatePath(`/superadmin/tenants/${id}`);
  redirect(`/superadmin/tenants/${id}?hold=${hold ? "on" : "off"}`);
}
