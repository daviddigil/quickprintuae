"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireSuperadmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { OFFER_KINDS, OFFER_THEMES, validateOffer } from "@/lib/offers";
import { fromDubaiInput } from "@/lib/offer-themes";
import { cancelRedemption, clearOffersCache } from "@/server/offers";

export type OfferFormState = { errors: Record<string, string>; message?: string } | null;

const Raw = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().max(120),
  code: z.string().trim().max(40),
  headline: z.string().trim().max(160),
  description: z.string().trim().max(600),
  theme: z.enum(OFFER_THEMES),
  kind: z.enum(OFFER_KINDS),
  audience: z.enum(["new", "all"]),
  status: z.enum(["draft", "active", "paused"]),
});

const numOrNull = (v: FormDataEntryValue | null) => { const s = (v ?? "").toString().trim(); if (s === "") return null; const n = Number(s); return Number.isFinite(n) ? n : NaN; };
const refresh = () => { clearOffersCache(); revalidatePath("/superadmin/offers"); revalidatePath("/", "layout"); };

/** Create or update an offer. Returns field errors for the form; redirects to the list on success. */
export async function saveOffer(_prev: OfferFormState, fd: FormData): Promise<OfferFormState> {
  const { user } = await requireSuperadmin();
  const parsed = Raw.safeParse({
    id: fd.get("id") || undefined, name: fd.get("name") ?? "", code: fd.get("code") ?? "", headline: fd.get("headline") ?? "", description: fd.get("description") ?? "",
    theme: fd.get("theme") ?? "custom", kind: fd.get("kind") ?? "", audience: fd.get("audience") ?? "new", status: fd.get("status") ?? "draft",
  });
  if (!parsed.success) return { errors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0] ?? "form"), i.message])), message: "Check the highlighted fields." };
  const r = parsed.data;
  const value = numOrNull(fd.get("value")) ?? 0;
  const durationMonths = numOrNull(fd.get("durationMonths"));
  const maxRedemptions = numOrNull(fd.get("maxRedemptions"));
  const startsAt = fromDubaiInput(String(fd.get("startsAt") ?? "")), endsAt = fromDubaiInput(String(fd.get("endsAt") ?? ""));
  const code = r.code ? r.code.toUpperCase() : null;
  const errors: Record<string, string> = {};
  for (const i of validateOffer({ name: r.name, kind: r.kind, value, durationMonths: Number.isNaN(durationMonths) ? -1 : durationMonths, startsAt, endsAt, maxRedemptions: Number.isNaN(maxRedemptions) ? -1 : maxRedemptions, code })) errors[i.field] ||= i.message;
  const planCodes = fd.getAll("planCodes").map(String);
  const cycles = fd.getAll("cycles").map(String).filter((c) => c === "monthly" || c === "yearly");
  if (!cycles.length) errors.cycles = "Choose at least one billing cycle";
  if (planCodes.length) {
    const known = new Set((await db.query.plans.findMany({ columns: { code: true } })).map((p) => p.code));
    if (planCodes.some((c) => !known.has(c))) errors.planCodes = "Unknown plan";
  }
  if (code) {
    const dup = await db.query.offers.findFirst({ where: r.id ? and(sql`upper(${schema.offers.code}) = ${code}`, ne(schema.offers.id, r.id)) : sql`upper(${schema.offers.code}) = ${code}`, columns: { id: true } });
    if (dup) errors.code = "This code is already used by another offer";
  }
  let redeemed = 0;
  if (r.id) {
    const cur = await db.query.offers.findFirst({ where: eq(schema.offers.id, r.id) });
    if (!cur) return { errors: {}, message: "Offer not found." };
    redeemed = cur.redeemedCount;
    if (maxRedemptions != null && maxRedemptions < redeemed) errors.maxRedemptions = `${redeemed} already redeemed: the limit cannot be lower`;
  }
  if (Object.keys(errors).length) return { errors, message: "Check the highlighted fields." };

  const values = {
    name: r.name, code, headline: r.headline, description: r.description, theme: r.theme, kind: r.kind, value, durationMonths: r.kind === "trial_extension" || r.kind === "free_months" ? null : durationMonths,
    planCodes, cycles, audience: r.audience, startsAt: startsAt!, endsAt: endsAt!, maxRedemptions, showBanner: fd.get("showBanner") === "on", status: r.status, updatedAt: new Date(),
  };
  if (r.id) {
    await db.update(schema.offers).set(values).where(eq(schema.offers.id, r.id));
    await audit("offer.updated", { offerId: r.id, name: r.name, kind: r.kind, value, status: r.status });
  } else {
    const [row] = await db.insert(schema.offers).values({ ...values, createdBy: user.id }).returning({ id: schema.offers.id });
    await audit("offer.created", { offerId: row.id, name: r.name, kind: r.kind, value, status: r.status, code });
  }
  refresh();
  redirect("/superadmin/offers?saved=1");
}

async function load(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const o = await db.query.offers.findFirst({ where: eq(schema.offers.id, id) });
  if (!o) redirect("/superadmin/offers?error=" + encodeURIComponent("Offer not found"));
  return o;
}

export async function setOfferStatus(fd: FormData) {
  await requireSuperadmin();
  const o = await load(fd);
  const to = String(fd.get("to"));
  if (!["active", "paused", "draft"].includes(to)) redirect("/superadmin/offers");
  await db.update(schema.offers).set({ status: to, updatedAt: new Date() }).where(eq(schema.offers.id, o.id));
  await audit(to === "paused" ? "offer.paused" : to === "active" ? "offer.resumed" : "offer.drafted", { offerId: o.id, name: o.name });
  refresh();
  redirect("/superadmin/offers?saved=1");
}

export async function duplicateOffer(fd: FormData) {
  const { user } = await requireSuperadmin();
  const o = await load(fd);
  const { id: _id, code: _code, redeemedCount: _rc, createdAt: _c, updatedAt: _u, ...rest } = o; void _id; void _code; void _rc; void _c; void _u;
  // a code must stay unique, so the copy starts without one; it is a draft until the superadmin publishes it
  const [row] = await db.insert(schema.offers).values({ ...rest, name: `${o.name} (copy)`, code: null, status: "draft", createdBy: user.id }).returning({ id: schema.offers.id });
  await audit("offer.duplicated", { from: o.id, offerId: row.id, name: o.name });
  refresh();
  redirect(`/superadmin/offers/${row.id}?saved=1`);
}

export async function deleteOffer(fd: FormData) {
  await requireSuperadmin();
  const o = await load(fd);
  const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.offerRedemptions).where(eq(schema.offerRedemptions.offerId, o.id));
  if (o.redeemedCount > 0 || Number(n.n) > 0) redirect("/superadmin/offers?error=" + encodeURIComponent("This offer has redemptions and cannot be deleted. Pause it instead."));
  await db.delete(schema.offers).where(eq(schema.offers.id, o.id));
  await audit("offer.deleted", { offerId: o.id, name: o.name });
  refresh();
  redirect("/superadmin/offers?saved=1");
}

export async function cancelOfferRedemption(fd: FormData) {
  await requireSuperadmin();
  const id = String(fd.get("redemptionId") ?? "");
  const r = await cancelRedemption(id);
  if (r) await audit("offer.redemption_cancelled", { offerId: r.offerId, redemptionId: r.id }, r.tenantId);
  refresh();
  redirect(`/superadmin/offers/${String(fd.get("offerId"))}?saved=1`);
}
