"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSuperadmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { issueSaasCreditNote } from "@/server/credit-notes";

/** Issues the (single, idempotent) credit note for a void or paid SaaS invoice that is being cancelled or refunded. */
export async function issueSaasCreditNoteAction(fd: FormData) {
  await requireSuperadmin();
  const id = String(fd.get("invoiceId") ?? "");
  const reason = String(fd.get("reason") ?? "").trim().slice(0, 300) || null;
  const inv = /^[0-9a-f-]{36}$/i.test(id) ? await db.query.saasInvoices.findFirst({ where: eq(schema.saasInvoices.id, id) }) : null;
  if (!inv || !["void", "paid"].includes(inv.status)) redirect("/superadmin/invoices?msg=" + encodeURIComponent("Credit notes can only be issued for void or paid invoices."));
  const note = await issueSaasCreditNote(inv.id, reason ?? `Invoice ${inv.status}`);
  await audit("invoice.credit_note", { invoice: inv.number, creditNote: note?.number }, inv.tenantId);
  revalidatePath("/superadmin/invoices");
  redirect(`/superadmin/invoices/credit-note/${note!.id}`);
}
