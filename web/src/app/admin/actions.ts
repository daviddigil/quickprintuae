"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { DIRECTORY_TAG } from "@/server/directory";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireStaff, hashPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { encrypt } from "@/lib/crypto";
import { EMIRATES, ORDER_STATUSES, type DeliveryProviderCode, type OrderStatus, type TenantSettings } from "@/lib/types";
import { NEXT_STATUSES, setOrderStatus } from "@/server/orders";
import { bookDelivery } from "@/server/delivery";
import { DEFAULT_PRODUCTS } from "@/lib/catalog-defaults";

/* helpers */
const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();
const optStr = (fd: FormData, k: string) => str(fd, k) || null;
const num = (fd: FormData, k: string, d = 0) => { const v = Number(str(fd, k)); return Number.isFinite(v) && str(fd, k) !== "" ? v : d; };
const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";
const back = (path: string, msg?: string, err?: boolean): never => redirect(`${path}${msg ? `?${err ? "error" : "ok"}=${encodeURIComponent(msg)}` : ""}`);

async function loadOrder(tenantId: string, id: string) {
  const o = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, id), eq(schema.orders.tenantId, tenantId)) });
  if (!o) throw new Error("Order not found");
  return o;
}
async function saveSettings(tenantId: string, current: TenantSettings, patch: Partial<TenantSettings>) {
  await db.update(schema.tenants).set({ settings: { ...current, ...patch } }).where(eq(schema.tenants.id, tenantId));
}

/* ---------- orders ---------- */
export async function changeOrderStatus(fd: FormData) {
  const { tenant, user } = await requireStaff();
  const id = str(fd, "orderId");
  const to = str(fd, "status") as OrderStatus;
  const o = await loadOrder(tenant.id, id);
  if (!(ORDER_STATUSES as readonly string[]).includes(to) || !NEXT_STATUSES[o.status].includes(to)) back(`/admin/orders/${id}`, `Cannot move from ${o.status} to ${to}`, true);
  await setOrderStatus(o.id, to, optStr(fd, "message") ?? undefined, user.id);
  await audit("order.status", { orderId: o.id, number: o.number, from: o.status, to }, tenant.id);
  revalidatePath(`/admin/orders/${id}`);
  back(`/admin/orders/${id}`, `Status updated`);
}

export async function saveInternalNotes(fd: FormData) {
  const { tenant } = await requireStaff();
  const o = await loadOrder(tenant.id, str(fd, "orderId"));
  await db.update(schema.orders).set({ internalNotes: str(fd, "internalNotes").slice(0, 5000), updatedAt: new Date() }).where(eq(schema.orders.id, o.id));
  back(`/admin/orders/${o.id}`, "Notes saved");
}

export async function bookCourier(fd: FormData) {
  const { tenant } = await requireStaff();
  const o = await loadOrder(tenant.id, str(fd, "orderId"));
  if (o.fulfillment !== "delivery") back(`/admin/orders/${o.id}`, "This is a pickup order", true);
  let msg = "";
  try {
    const r = await bookDelivery(tenant, o, (str(fd, "provider") || undefined) as DeliveryProviderCode | undefined);
    await db.update(schema.orders).set({ deliveryProvider: r.provider, deliveryRef: r.ref, deliveryTrackingUrl: r.trackingUrl ?? null, deliveryStatus: r.status, updatedAt: new Date() }).where(eq(schema.orders.id, o.id));
    await audit("order.delivery_booked", { orderId: o.id, provider: r.provider, ref: r.ref }, tenant.id);
    msg = `Delivery booked with ${r.provider} (${r.ref})`;
  } catch (e) {
    back(`/admin/orders/${o.id}`, `Booking failed: ${(e as Error).message}`, true);
  }
  back(`/admin/orders/${o.id}`, msg);
}

export async function setManualTracking(fd: FormData) {
  const { tenant } = await requireStaff();
  const o = await loadOrder(tenant.id, str(fd, "orderId"));
  await db.update(schema.orders).set({
    deliveryProvider: optStr(fd, "provider") ?? "manual", deliveryRef: optStr(fd, "ref"), deliveryTrackingUrl: optStr(fd, "trackingUrl"),
    deliveryStatus: optStr(fd, "deliveryStatus") ?? "assigned", updatedAt: new Date(),
  }).where(eq(schema.orders.id, o.id));
  back(`/admin/orders/${o.id}`, "Delivery details saved");
}

/* ---------- products ---------- */
export async function toggleProduct(fd: FormData) {
  const { tenant } = await requireStaff();
  const field = str(fd, "field") === "featured" ? "featured" : "active";
  const p = await db.query.products.findFirst({ where: and(eq(schema.products.id, str(fd, "productId")), eq(schema.products.tenantId, tenant.id)) });
  if (!p) back("/admin/products", "Product not found", true);
  await db.update(schema.products).set({ [field]: !p![field] }).where(eq(schema.products.id, p!.id));
  revalidatePath("/admin/products");
}

export async function addProductFromTemplate(fd: FormData) {
  const { tenant } = await requireStaff();
  const tpl = DEFAULT_PRODUCTS.find((p) => p.slug === str(fd, "template"));
  if (!tpl) back("/admin/products", "Unknown template", true);
  const existing = await db.query.products.findMany({ where: eq(schema.products.tenantId, tenant.id), columns: { slug: true } });
  let slug = tpl!.slug; let i = 2;
  while (existing.some((e) => e.slug === slug)) slug = `${tpl!.slug}-${i++}`;
  const [p] = await db.insert(schema.products).values({ ...tpl!, slug, name: i > 2 ? `${tpl!.name} (copy)` : tpl!.name, tenantId: tenant.id, featured: false, sortOrder: existing.length }).returning();
  await audit("product.create", { productId: p.id, template: tpl!.slug }, tenant.id);
  redirect(`/admin/products/${p.id}`);
}

export async function deleteProduct(fd: FormData) {
  const { tenant } = await requireStaff();
  const id = str(fd, "productId");
  await db.delete(schema.products).where(and(eq(schema.products.id, id), eq(schema.products.tenantId, tenant.id)));
  await audit("product.delete", { productId: id }, tenant.id);
  back("/admin/products", "Product deleted");
}

/* ---------- fulfillment ---------- */
export async function savePickupLocation(fd: FormData) {
  const { tenant } = await requireStaff();
  const data = z.object({
    name: z.string().min(2).max(120), address: z.string().min(3).max(300), emirate: z.enum(EMIRATES as [string, ...string[]]),
    hours: z.string().max(120), mapUrl: z.string().url().or(z.literal("")),
  }).safeParse({ name: str(fd, "name"), address: str(fd, "address"), emirate: str(fd, "emirate"), hours: str(fd, "hours"), mapUrl: str(fd, "mapUrl") });
  if (!data.success) back("/admin/fulfillment", "Please check the pickup location fields", true);
  const v = { ...data.data!, mapUrl: data.data!.mapUrl || null, active: bool(fd, "active") };
  const id = str(fd, "id");
  if (id) await db.update(schema.pickupLocations).set(v).where(and(eq(schema.pickupLocations.id, id), eq(schema.pickupLocations.tenantId, tenant.id)));
  else await db.insert(schema.pickupLocations).values({ ...v, tenantId: tenant.id });
  back("/admin/fulfillment", "Pickup location saved");
}

export async function deletePickupLocation(fd: FormData) {
  const { tenant } = await requireStaff();
  try {
    await db.delete(schema.pickupLocations).where(and(eq(schema.pickupLocations.id, str(fd, "id")), eq(schema.pickupLocations.tenantId, tenant.id)));
  } catch {
    await db.update(schema.pickupLocations).set({ active: false }).where(and(eq(schema.pickupLocations.id, str(fd, "id")), eq(schema.pickupLocations.tenantId, tenant.id)));
    back("/admin/fulfillment", "Location has orders, so it was deactivated instead");
  }
  back("/admin/fulfillment", "Location removed");
}

export async function saveZones(fd: FormData) {
  const { tenant } = await requireStaff();
  const zones = await db.query.deliveryZones.findMany({ where: eq(schema.deliveryZones.tenantId, tenant.id) });
  for (const z of zones) {
    await db.update(schema.deliveryZones).set({
      fee: Math.max(0, num(fd, `fee_${z.id}`, z.fee)),
      freeAbove: str(fd, `free_${z.id}`) === "" ? null : Math.max(0, num(fd, `free_${z.id}`)),
      minLeadHours: Math.max(0, Math.round(num(fd, `lead_${z.id}`, z.minLeadHours))),
      sameDay: bool(fd, `same_${z.id}`), active: bool(fd, `active_${z.id}`),
    }).where(eq(schema.deliveryZones.id, z.id));
  }
  back("/admin/fulfillment", "Delivery zones saved");
}

export async function saveSlotSettings(fd: FormData) {
  const { tenant } = await requireStaff();
  const s = tenant.settings;
  const openHour = Math.min(23, Math.max(0, Math.round(num(fd, "openHour", 9))));
  const closeHour = Math.min(24, Math.max(openHour + 1, Math.round(num(fd, "closeHour", 21))));
  await saveSettings(tenant.id, s, { delivery: { ...s.delivery,
    enabled: bool(fd, "enabled"), pickupEnabled: bool(fd, "pickupEnabled"),
    slotMinutes: [30, 60, 90, 120, 180, 240].includes(num(fd, "slotMinutes")) ? num(fd, "slotMinutes") : 120,
    openHour, closeHour, scheduleDaysAhead: Math.min(60, Math.max(0, Math.round(num(fd, "scheduleDaysAhead", 7)))),
    closedWeekdays: [0, 1, 2, 3, 4, 5, 6].filter((d) => bool(fd, `closed_${d}`)),
  } });
  back("/admin/fulfillment", "Scheduling saved");
}

export async function saveDeliveryProvider(fd: FormData) {
  const { tenant } = await requireStaff({ ownerOnly: true });
  const s = tenant.settings;
  const code = str(fd, "code") as DeliveryProviderCode;
  if (!["inhouse", "jeebly", "quiqup", "careem_box", "aramex", "manual"].includes(code)) back("/admin/fulfillment", "Unknown provider", true);
  const prev = s.delivery.providers?.[code] ?? { enabled: false };
  const apiKey = str(fd, "apiKey");
  const next = { ...prev, enabled: bool(fd, "enabled"), accountId: optStr(fd, "accountId") ?? undefined, sandbox: bool(fd, "sandbox"), ...(apiKey ? { apiKeyEnc: encrypt(apiKey) } : {}) };
  const providers = { ...s.delivery.providers, [code]: next };
  const defaultProvider = bool(fd, "makeDefault") && next.enabled ? code : s.delivery.defaultProvider;
  await saveSettings(tenant.id, s, { delivery: { ...s.delivery, providers, defaultProvider } });
  await audit("settings.delivery_provider", { code, enabled: next.enabled, keyChanged: !!apiKey }, tenant.id);
  back("/admin/fulfillment", `${code} settings saved`);
}

/* ---------- payments ---------- */
export async function savePayments(fd: FormData) {
  const { tenant } = await requireStaff({ ownerOnly: true });
  const s = tenant.settings;
  const p = s.payments ?? {};
  const which = str(fd, "provider");
  if (which === "stripe") {
    const pk = str(fd, "publishableKey"), sk = str(fd, "secretKey"), wh = str(fd, "webhookSecret");
    if (sk && !/^(sk|rk)_(test|live)_/.test(sk)) back("/admin/payments", "Stripe secret key should start with sk_live_ / sk_test_", true);
    if (pk && !/^pk_(test|live)_/.test(pk)) back("/admin/payments", "Stripe publishable key should start with pk_live_ / pk_test_", true);
    p.stripe = { ...p.stripe, enabled: bool(fd, "enabled"), publishableKey: pk || p.stripe?.publishableKey,
      ...(sk ? { secretKeyEnc: encrypt(sk) } : {}), ...(wh ? { webhookSecretEnc: encrypt(wh) } : {}) };
    if (p.stripe.enabled && !p.stripe.secretKeyEnc) back("/admin/payments", "Add a secret key before enabling Stripe", true);
  } else if (which === "mamo") {
    const key = str(fd, "apiKey"), wh = str(fd, "webhookSecret");
    p.mamo = { ...p.mamo, enabled: bool(fd, "enabled"), sandbox: bool(fd, "sandbox"),
      ...(key ? { apiKeyEnc: encrypt(key) } : {}), ...(wh ? { webhookSecretEnc: encrypt(wh) } : {}) };
    if (p.mamo.enabled && !p.mamo.apiKeyEnc) back("/admin/payments", "Add an API key before enabling Mamo Pay", true);
  } else back("/admin/payments", "Unknown provider", true);
  await saveSettings(tenant.id, s, { payments: p });
  await audit("settings.payments", { provider: which, enabled: bool(fd, "enabled") }, tenant.id);
  back("/admin/payments", "Payment settings saved");
}

/* ---------- store settings ---------- */
export async function saveStoreSettings(fd: FormData) {
  const { tenant } = await requireStaff({ ownerOnly: true });
  const parsed = z.object({
    name: z.string().min(2).max(120),
    legalName: z.string().max(200),
    trn: z.string().regex(/^(\d{15})?$/, "TRN must be 15 digits"),
    logoUrl: z.string().url().or(z.literal("")),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    email: z.string().email().or(z.literal("")),
    phone: z.string().max(30), whatsapp: z.string().max(30), address: z.string().max(300),
    emirate: z.enum(EMIRATES as [string, ...string[]]),
    customDomain: z.string().regex(/^([a-z0-9-]+\.)+[a-z]{2,}$/i, "Invalid domain").or(z.literal("")),
  }).safeParse(Object.fromEntries(["name", "legalName", "trn", "logoUrl", "primaryColor", "email", "phone", "whatsapp", "address", "emirate", "customDomain"].map((k) => [k, str(fd, k)])));
  if (!parsed.success) back("/admin/settings", parsed.error!.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), true);
  const v = parsed.data!;
  const domain = v.customDomain.toLowerCase() || null;
  if (domain) {
    const taken = await db.query.tenants.findFirst({ where: eq(schema.tenants.customDomain, domain) });
    if (taken && taken.id !== tenant.id) back("/admin/settings", "That domain is already connected to another store", true);
  }
  await db.update(schema.tenants).set({
    name: v.name, legalName: v.legalName || null, trn: v.trn || null, logoUrl: v.logoUrl || null, primaryColor: v.primaryColor,
    email: v.email || null, phone: v.phone || null, whatsapp: v.whatsapp || null, address: v.address || null, emirate: v.emirate, area: str(fd, "area").slice(0, 60) || null, directoryListed: bool(fd, "directoryListed"), customDomain: domain,
    settings: { ...tenant.settings,
      heroTitle: str(fd, "heroTitle") || undefined, heroSubtitle: str(fd, "heroSubtitle") || undefined, announcement: str(fd, "announcement") || undefined,
      pricesIncludeVat: bool(fd, "pricesIncludeVat"), aiDesignerEnabled: bool(fd, "aiDesignerEnabled"),
      confidentialRetentionHours: Math.min(720, Math.max(1, Math.round(num(fd, "confidentialRetentionHours", 72)))),
      orderPrefix: (str(fd, "orderPrefix") || tenant.settings.orderPrefix).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "QP",
    },
  }).where(eq(schema.tenants.id, tenant.id));
  await audit("settings.store", { customDomain: domain, directoryListed: bool(fd, "directoryListed") }, tenant.id);
  revalidateTag(DIRECTORY_TAG);
  revalidatePath("/admin", "layout");
  back("/admin/settings", "Store settings saved");
}

/* ---------- staff ---------- */
export async function createStaff(fd: FormData) {
  const { tenant } = await requireStaff({ ownerOnly: true });
  const parsed = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(8), role: z.enum(["staff", "owner"]), phone: z.string() })
    .safeParse({ name: str(fd, "name"), email: str(fd, "email").toLowerCase(), password: str(fd, "password"), role: str(fd, "role") || "staff", phone: str(fd, "phone") });
  if (!parsed.success) back("/admin/staff", "Name, valid email and a password of 8+ characters are required", true);
  const v = parsed.data!;
  const plan = tenant.planId ? await db.query.plans.findFirst({ where: eq(schema.plans.id, tenant.planId) }) : null;
  const staff = await db.query.users.findMany({ where: and(eq(schema.users.tenantId, tenant.id), eq(schema.users.active, true)) });
  const team = staff.filter((u) => u.role !== "customer");
  if (plan?.maxStaff && team.length >= plan.maxStaff) back("/admin/staff", `Your ${plan.name} plan allows ${plan.maxStaff} team members. Upgrade to add more.`, true);
  if (staff.some((u) => u.email.toLowerCase() === v.email) ) back("/admin/staff", "A user with that email already exists in this store", true);
  try {
    await db.insert(schema.users).values({ tenantId: tenant.id, role: v.role, name: v.name, email: v.email, phone: v.phone || null, passwordHash: await hashPassword(v.password) });
  } catch { back("/admin/staff", "A user with that email already exists in this store", true); }
  await audit("staff.create", { email: v.email, role: v.role }, tenant.id);
  back("/admin/staff", `${v.name} added. They can sign in at /login`);
}

export async function toggleStaff(fd: FormData) {
  const { tenant, user } = await requireStaff({ ownerOnly: true });
  const id = str(fd, "userId");
  if (id === user.id) back("/admin/staff", "You can't deactivate yourself", true);
  const u = await db.query.users.findFirst({ where: and(eq(schema.users.id, id), eq(schema.users.tenantId, tenant.id)) });
  if (!u || u.role === "customer") back("/admin/staff", "User not found", true);
  await db.update(schema.users).set({ active: !u!.active }).where(eq(schema.users.id, u!.id));
  await audit(u!.active ? "staff.deactivate" : "staff.activate", { userId: u!.id, email: u!.email }, tenant.id);
  back("/admin/staff", `${u!.name} ${u!.active ? "deactivated" : "re-activated"}`);
}

/* billing model: owner chooses monthly subscription vs pay-per-order commission */
export async function changeBillingPlan(fd: FormData) {
  const { tenant, user } = await requireStaff();
  if (user.role !== "owner") return back("/admin/billing", "Only the owner can change the plan", true);
  const { ensurePlans } = await import("@/server/provision");
  await ensurePlans(db);
  const { requestPlanChange, clearPendingPlanChange, PlanChangeError } = await import("@/server/billing/plan-change");
  if (str(fd, "cancel")) {
    await clearPendingPlanChange(tenant.id);
    await audit("billing.plan_change_cancelled");
    revalidatePath("/admin/billing");
    return back("/admin/billing", "Scheduled change cancelled");
  }
  try {
    const r = await requestPlanChange(tenant.id, str(fd, "planId"));
    await audit("billing.plan_change", { planId: str(fd, "planId"), result: r });
    revalidatePath("/admin/billing");
    return back("/admin/billing", r === "applied" ? "Plan updated" : r === "scheduled" ? "Change scheduled for the start of next month" : "You are already on this plan");
  } catch (e) {
    if (e instanceof PlanChangeError) return back("/admin/billing", e.message, true);
    throw e;
  }
}
