"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSuperadmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
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
    maxOrdersPerMonth: num(fd, "maxOrdersPerMonth"),
    maxStaff: num(fd, "maxStaff"),
    sortOrder: num(fd, "sortOrder") ?? 0,
    features: str(fd, "features").split("\n").map((s) => s.trim()).filter(Boolean),
    active: fd.get("active") === "on",
  };
  if (!values.code || !values.name) redirect("/superadmin/plans?error=missing");
  if (id) await db.update(schema.plans).set(values).where(eq(schema.plans.id, id));
  else await db.insert(schema.plans).values(values);
  await audit(id ? "plan.updated" : "plan.created", { code: values.code }, null);
  revalidatePath("/superadmin/plans");
  redirect("/superadmin/plans?saved=1");
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
