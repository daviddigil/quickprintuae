"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { setQuoteStatus } from "@/server/quotes";

export async function changeQuoteStatus(fd: FormData) {
  const { tenant } = await requireStaff();
  const id = (fd.get("quoteId") ?? "").toString();
  const status = (fd.get("status") ?? "").toString();
  const filter = (fd.get("filter") ?? "").toString();
  const row = await setQuoteStatus(tenant.id, id, status);
  if (row) await audit("quote.status", { quoteId: row.id, status }, tenant.id);
  revalidatePath("/admin/quotes");
  const q = filter && filter !== "all" ? `&status=${encodeURIComponent(filter)}` : "";
  redirect(`/admin/quotes?${row ? `ok=${encodeURIComponent("Marked as " + status)}` : "error=Quote%20not%20found"}${q}`);
}
