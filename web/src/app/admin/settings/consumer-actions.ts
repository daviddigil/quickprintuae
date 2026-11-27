"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";

/** Owner-only: the shop's returns / cancellation / delivery terms and complaint email. Never touches the legal-hold flag (superadmin only). */
export async function saveConsumerTerms(fd: FormData) {
  const { tenant } = await requireStaff({ ownerOnly: true });
  const parsed = z.object({
    returnsPolicy: z.string().max(5000),
    complaintEmail: z.string().email().or(z.literal("")),
  }).safeParse({ returnsPolicy: (fd.get("returnsPolicy") ?? "").toString().trim(), complaintEmail: (fd.get("complaintEmail") ?? "").toString().trim() });
  if (!parsed.success) redirect(`/admin/settings?error=${encodeURIComponent("Complaint email must be a valid email address and the policy at most 5000 characters")}`);
  const v = parsed.data;
  await db.update(schema.tenants).set({ returnsPolicy: v.returnsPolicy || null, complaintEmail: v.complaintEmail || null }).where(eq(schema.tenants.id, tenant.id));
  await audit("settings.consumer_terms", { custom: !!v.returnsPolicy, complaintEmail: !!v.complaintEmail }, tenant.id);
  revalidatePath("/admin/settings");
  revalidatePath(`/s/${tenant.slug}`, "layout");
  redirect(`/admin/settings?ok=${encodeURIComponent("Customer terms saved")}`);
}
