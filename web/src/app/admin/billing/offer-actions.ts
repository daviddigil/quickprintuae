"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { claimOfferForExistingShop } from "@/server/offers";

/** Owner claims a live offer (audience 'all') for the shop's current plan. */
export async function claimOffer(fd: FormData) {
  const { tenant, user } = await requireStaff();
  const go = (m: string, err = false) => redirect(`/admin/billing?${err ? "error" : "ok"}=${encodeURIComponent(m)}`);
  if (user.role !== "owner") return go("Only the owner can claim an offer", true);
  const offerId = String(fd.get("offerId") ?? "");
  const code = String(fd.get("code") ?? "").trim() || null;
  const r = await claimOfferForExistingShop(tenant.id, offerId, code);
  if (!r.ok) return go(r.reason === "already" ? "You have already claimed this offer" : "This offer is no longer available for your shop", true);
  await audit("offer.claimed", { offerId, name: r.redemption.terms.name });
  revalidatePath("/admin/billing");
  return go(`Offer claimed: ${r.redemption.terms.name}. It will show on your next invoice.`);
}
