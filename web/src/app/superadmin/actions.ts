"use server";
import { invalidateDirectory } from "@/server/directory";
import { USAGE_KINDS } from "@/lib/usage";
import { saveUsageRate } from "@/server/usage";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSuperadmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { parsePlanFlags } from "@/server/billing/flags";
import { collectInvoice, generateInvoicesForPeriod, markInvoicePaid } from "@/server/billing";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => { const v = str(fd, k); return v === "" ? null : Number(v); };
type TenantStatus = "trial" | "active" | "past_due" | "suspended" | "cancelled";

export async function updateTenantPlan(fd: FormData) {
  await requireSuperadmin();
  const id = str(fd, "tenantId");
  const planId = str(fd, "planId") || null;
  const billingCycle = str(fd, "billingCycle") === "yearly" ? "yearly" : "monthly";
  await db.update(schema.tenants).set({ planId, billingCycle }).where(eq(schema.tenants.id, id));
  await audit("tenant.plan_changed", { planId, billingCycle }, id);
  revalidatePath(`/superadmin/tenants/${id}`);
}

export async function setTenantStatus(fd: FormData) {
  await requireSuperadmin();
  const id = str(fd, "tenantId");
  const status = str(fd, "status") as TenantStatus;
  if (!["trial", "active", "past_due", "suspended", "cancelled"].includes(status)) return;
  await db.update(schema.tenants).set({ status }).where(eq(schema.tenants.id, id));
  await audit(`tenant.status.${status}`, {}, id);
  revalidatePath(`/superadmin/tenants/${id}`);
}

export async function extendTrial(fd: FormData) {
  await requireSuperadmin();
  const id = str(fd, "tenantId");
  const days = Math.min(90, Math.max(1, Number(str(fd, "days")) || 7));
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, id) });
  if (!t) return;
  const base = t.trialEndsAt && t.trialEndsAt > new Date() ? t.trialEndsAt : new Date();
  await db.update(schema.tenants).set({ trialEndsAt: new Date(base.getTime() + days * 86400_000), status: "trial" }).where(eq(schema.tenants.id, id));
  await audit("tenant.trial_extended", { days }, id);
  revalidatePath(`/superadmin/tenants/${id}`);
}

export async function updateTenantDomain(fd: FormData) {
  await requireSuperadmin();
  const id = str(fd, "tenantId");
  const raw = str(fd, "customDomain").toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const customDomain = raw || null;
  if (customDomain && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(customDomain)) redirect(`/superadmin/tenants/${id}?error=domain`);
  try {
    await db.update(schema.tenants).set({ customDomain }).where(eq(schema.tenants.id, id));
  } catch {
    redirect(`/superadmin/tenants/${id}?error=domain_taken`);
  }
  await audit("tenant.domain_changed", { customDomain }, id);
  revalidatePath(`/superadmin/tenants/${id}`);
}

export async function deleteTenant(fd: FormData) {
  await requireSuperadmin();
  const id = str(fd, "tenantId");
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, id) });
  if (!t || str(fd, "confirm") !== t.slug) redirect(`/superadmin/tenants/${id}?error=confirm`);
  await db.delete(schema.tenants).where(eq(schema.tenants.id, id));
  await audit("tenant.deleted", { slug: t.slug, name: t.name }, null);
  redirect("/superadmin/tenants?deleted=1");
}

export async function savePlan(fd: FormData) {
  await requireSuperadmin();
  const id = str(fd, "id");
  const values = {
    code: str(fd, "code").toLowerCase(),
    name: str(fd, "name"),
    priceMonthly: num(fd, "priceMonthly") ?? 0,
    priceYearly: num(fd, "priceYearly") ?? 0,
    orderFeePct: num(fd, "orderFeePct") ?? 0,
    perJobFee: num(fd, "perJobFee") ?? 0,
    minOrderFee: num(fd, "minOrderFee") ?? 0,
    maxOrderFee: num(fd, "maxOrderFee"),
    maxOrdersPerMonth: num(fd, "maxOrdersPerMonth"),
    maxStaff: num(fd, "maxStaff"),
    sortOrder: num(fd, "sortOrder") ?? 0,
    features: str(fd, "features").split("\n").map((s) => s.trim()).filter(Boolean),
    active: fd.get("active") === "on",
    flags: parsePlanFlags(fd.getAll("flags")) ?? [],
    billingModel: str(fd, "billingModel") === "commission" ? "commission" : "subscription",
    includedUsage: Object.fromEntries(USAGE_KINDS.map((k) => [k.kind, Math.max(0, Math.floor(num(fd, `inc_${k.kind}`) ?? 0))])),
  };
  if (!values.code || !values.name) redirect("/superadmin/plans?error=missing");
  if (parsePlanFlags(fd.getAll("flags")) === null) redirect("/superadmin/plans?error=flags");
  if (id) await db.update(schema.plans).set(values).where(eq(schema.plans.id, id));
  else await db.insert(schema.plans).values(values);
  await audit(id ? "plan.updated" : "plan.created", { code: values.code, flags: values.flags }, null);
  revalidatePath("/superadmin/plans");
  redirect("/superadmin/plans?saved=1");
}

/** Platform rate card for pay-as-you-go usage. */
export async function saveUsageRates(fd: FormData) {
  await requireSuperadmin();
  for (const k of USAGE_KINDS) {
    const v = num(fd, `rate_${k.kind}`);
    if (v === null) continue;
    if (v < 0 || v > 100) redirect("/superadmin/usage?error=range");
    await saveUsageRate(k.kind, v, fd.get(`active_${k.kind}`) === "on");
  }
  await audit("usage.rates_updated", {}, null);
  revalidatePath("/superadmin/usage");
  redirect("/superadmin/usage?saved=1");
}

const COMMISSION_MODES = ["plan", "custom", "commission_only", "subscription_only", "none"] as const;

/** Per-shop commission & billing terms (superadmin only). Blank number = use the plan's value; "No cap" removes the per-order maximum. */
export async function saveCommissionTerms(fd: FormData) {
  const { user } = await requireSuperadmin();
  const tenantId = str(fd, "tenantId");
  const back = (q: string): never => redirect(`/superadmin/tenants/${tenantId}?${q}`);
  const mode = str(fd, "mode") as (typeof COMMISSION_MODES)[number];
  if (!COMMISSION_MODES.includes(mode)) back("error=commission_mode");
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId) });
  if (!tenant) notFound();
  const pct = num(fd, "pct"), perJobFee = num(fd, "perJobFee"), minOrderFee = num(fd, "minOrderFee"), maxOrderFee = num(fd, "maxOrderFee");
  const inRange = (v: number | null, lo: number, hi: number) => v === null || (v >= lo && v <= hi);
  if (!inRange(pct, 0, 30) || !inRange(perJobFee, 0, 100) || !inRange(minOrderFee, 0, 1000) || !inRange(maxOrderFee, 0, 10000)) back("error=commission_range");
  if (minOrderFee !== null && maxOrderFee !== null && maxOrderFee < minOrderFee) back("error=commission_minmax");
  const noCap = fd.get("noCap") === "on";
  const override = mode === "plan" ? null : {
    mode,
    ...(pct !== null ? { pct } : {}), ...(perJobFee !== null ? { perJobFee } : {}), ...(minOrderFee !== null ? { minOrderFee } : {}),
    ...(noCap ? { maxOrderFee: null } : maxOrderFee !== null ? { maxOrderFee } : {}),
    note: str(fd, "note").slice(0, 300), updatedAt: new Date().toISOString(), updatedBy: user.id,
  };
  await db.update(schema.tenants).set({ commissionOverride: override }).where(eq(schema.tenants.id, tenantId));
  await audit("commission.terms", { tenantId, before: tenant.commissionOverride ?? null, after: override }, tenantId);
  revalidatePath(`/superadmin/tenants/${tenantId}`); revalidatePath("/superadmin/commissions");
  back("saved=commission");
}

export async function invoiceAction(fd: FormData) {
  await requireSuperadmin();
  const id = str(fd, "invoiceId");
  const op = str(fd, "op");
  if (op === "paid") await markInvoicePaid(id, "manual");
  else if (op === "void") await db.update(schema.saasInvoices).set({ status: "void" }).where(eq(schema.saasInvoices.id, id));
  else if (op === "collect") {
    const r = await collectInvoice(id);
    await audit("invoice.collect", { id, ...r }, null);
    revalidatePath("/superadmin/invoices");
    redirect(`/superadmin/invoices?collect=${r.status}${r.error ? `&msg=${encodeURIComponent(r.error)}` : ""}`);
  }
  await audit(`invoice.${op}`, { id }, null);
  revalidatePath("/superadmin/invoices");
}

export async function runInvoiceGeneration(fd: FormData) {
  await requireSuperadmin();
  const month = str(fd, "month"); // YYYY-MM
  const d = month ? new Date(`${month}-15T00:00:00Z`) : new Date();
  const created = await generateInvoicesForPeriod(d);
  await audit("invoice.generate", { month, created: created.length }, null);
  revalidatePath("/superadmin/invoices");
  redirect(`/superadmin/invoices?generated=${created.length}`);
}

/** Abuse control: switch the walk-in queue off for one shop (their owner can re-enable it unless the plan flag is also removed). */
/** Show or hide a shop in the public Live stores directory (superadmin override of the owner's switch). */
export async function setDirectoryListed(fd: FormData) {
  await requireSuperadmin();
  const id = str(fd, "tenantId"), listed = str(fd, "listed") === "1";
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, id) });
  if (!t) redirect("/superadmin/tenants");
  await db.update(schema.tenants).set({ directoryListed: listed }).where(eq(schema.tenants.id, id));
  await audit(listed ? "directory.listed_by_admin" : "directory.hidden_by_admin", {}, id);
  invalidateDirectory();
  revalidatePath(`/superadmin/tenants/${id}`);
  redirect(`/superadmin/tenants/${id}`);
}

export async function disableWalkIn(fd: FormData) {
  await requireSuperadmin();
  const id = str(fd, "tenantId");
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, id) });
  if (!t) redirect("/superadmin/tenants");
  await db.update(schema.tenants).set({ settings: { ...t.settings, walkIn: { ...(t.settings.walkIn ?? {}), enabled: false } } }).where(eq(schema.tenants.id, id));
  await audit("walkin.disabled_by_admin", {}, id);
  revalidatePath(`/superadmin/tenants/${id}`);
  redirect(`/superadmin/tenants/${id}?walkin=disabled`);
}
