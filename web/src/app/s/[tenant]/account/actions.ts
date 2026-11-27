"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCustomer } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { requireStorefrontTenant } from "@/lib/tenant";
import { createDataSubjectRequest } from "@/server/privacy";
import { setMarketingOptIn } from "@/server/consent";

async function ctx(slug: string) {
  const tenant = await requireStorefrontTenant(slug);
  const customer = await getCustomer(tenant.id);
  const back = (msg: string, err = false): never => redirect(`/s/${tenant.slug}/account?${err ? "error" : "ok"}=${encodeURIComponent(msg)}`);
  if (!customer) back("Please sign in first", true);
  return { tenant, customer: customer!, back };
}

/** "Delete my data": files an erasure request that the shop owner then processes (the shop is the controller). */
export async function requestErasure(fd: FormData) {
  const { tenant, customer, back } = await ctx((fd.get("store") ?? "").toString());
  const { request, created } = await createDataSubjectRequest({ tenantId: tenant.id, userId: customer.id, email: customer.email, kind: "erasure", note: (fd.get("note") ?? "").toString() });
  if (created) await audit("privacy.request.create", { requestId: request.id, kind: "erasure" }, tenant.id);
  back(created ? "Your deletion request was received. The shop will confirm within 30 days. Records the law requires them to keep (invoices) stay, without your personal details." : "You already have an open deletion request.");
}

/** Opt-in / opt-out of offers by email and WhatsApp. Transactional messages (order updates) are not affected. */
export async function updateMarketing(fd: FormData) {
  const { tenant, customer, back } = await ctx((fd.get("store") ?? "").toString());
  const granted = fd.get("marketing") === "on";
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  await setMarketingOptIn(tenant.id, customer.id, granted, ip);
  back(granted ? "You will receive offers from this shop. You can switch this off any time." : "You will no longer receive offers. Order updates still reach you.");
}
