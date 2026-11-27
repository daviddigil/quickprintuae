import "server-only";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import { and, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Order, Tenant } from "@/db/schema";
import { env } from "@/lib/env";
import { computeLinePrice, computeOrderTotals, PricingError, round2 } from "@/lib/pricing";
import { generateSlots, findSlot } from "@/lib/slots";
import { DEFAULT_TENANT_SETTINGS } from "@/lib/catalog-defaults";
import { EMIRATES, type CardDesign, type DeliverySettings } from "@/lib/types";
import { createCheckout, enabledProviders, type ProviderCode } from "./payments";
import { normalizePhone } from "@/lib/phone";
import { getWalkInProduct, isWalkInExtension, walkInGate } from "./walk-in/customers";
import { walkInSettings } from "./walk-in/settings";
import { storefrontColumns } from "./storefront-products";
import { createPrintJobs, nextTicketNo } from "./walk-in/queue";
import { NOT_OPEN_MESSAGE, orderingState } from "./trust/gating";
import { requiresRightsDeclaration } from "@/lib/rights-declaration";
import { RIGHTS_DECLARATION_VERSION } from "@/lib/compliance";

export class CheckoutError extends Error {
  constructor(message: string, public status = 400, public code?: string) { super(message); }
}

/* ---------- guest order access tokens ---------- */
export function orderToken(orderId: string) {
  return createHmac("sha256", env.authSecret).update(`order:${orderId}`).digest("base64url").slice(0, 32);
}
export function verifyOrderToken(orderId: string, token?: string | null) {
  if (!token) return false;
  const a = Buffer.from(orderToken(orderId));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Plan / status gate before accepting new orders. */
export async function assertTenantCanTakeOrders(tenant: Tenant) {
  // seller verification: no live customer payments before the superadmin approves the trade licence (owner TEST orders only with PAYMENTS_FAKE=1)
  if (!(await orderingState(tenant)).open) throw new CheckoutError(NOT_OPEN_MESSAGE, 403);
  if (tenant.status === "suspended" || tenant.status === "cancelled")
    throw new CheckoutError("This shop is not accepting orders right now.", 403);
  if (tenant.status === "trial" && tenant.trialEndsAt && tenant.trialEndsAt.getTime() < Date.now() && !tenant.currentPeriodEnd)
    throw new CheckoutError("This shop is not accepting online orders at the moment. Please contact the shop directly.", 403);
  if (tenant.planId) {
    const plan = await db.query.plans.findFirst({ where: eq(schema.plans.id, tenant.planId) });
    if (plan?.maxOrdersPerMonth) {
      const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.orders)
        .where(and(eq(schema.orders.tenantId, tenant.id), gte(schema.orders.createdAt, start), ne(schema.orders.status, "pending_payment")));
      if (n >= plan.maxOrdersPerMonth)
        throw new CheckoutError("This shop has reached its online order limit for this month. Please contact the shop directly.", 403);
    }
  }
}

export function deliverySettings(tenant: Tenant): DeliverySettings {
  return { ...DEFAULT_TENANT_SETTINGS.delivery, ...(tenant.settings?.delivery ?? {}) };
}

/* ---------- input ---------- */
const Line = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(100000),
  pages: z.number().int().min(1).max(10000).default(1),
  selections: z.record(z.string(), z.string()).default({}),
  fileIds: z.array(z.string().uuid()).max(50).default([]),
  design: z.any().optional(),
});
export const CheckoutInput = z.object({
  contact: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(200),
    phone: z.string().trim().min(7).max(30),
  }),
  lines: z.array(Line).min(1).max(50),
  fulfillment: z.enum(["pickup", "delivery"]),
  pickupLocationId: z.string().uuid().optional(),
  address: z.object({
    line1: z.string().trim().min(3).max(200),
    line2: z.string().trim().max(200).optional(),
    area: z.string().trim().min(2).max(120),
    city: z.string().trim().min(2).max(120),
    emirate: z.enum(EMIRATES as [string, ...string[]]),
    notes: z.string().trim().max(500).optional(),
  }).optional(),
  slotStart: z.string().datetime(),
  provider: z.literal("stripe").default("stripe"),
  notes: z.string().max(1000).optional(),
  /** customer ticked "I own / may print this content and it is lawful" (required when the cart has an uploaded file or design) */
  rightsDeclared: z.boolean().optional(),
});
export type CheckoutInputT = z.infer<typeof CheckoutInput>;

function isDesign(d: unknown): d is CardDesign {
  const x = d as CardDesign;
  return !!x && typeof x === "object" && typeof x.widthMm === "number" && typeof x.heightMm === "number" && !!x.front && Array.isArray(x.front.elements);
}

/** Creates the order (pending_payment) and returns it. Prices are recomputed server-side. */
export async function createOrder(tenant: Tenant, input: CheckoutInputT, customerId: string | null) {
  await assertTenantCanTakeOrders(tenant);
  if (!(await enabledProviders(tenant)).includes(input.provider as ProviderCode))
    throw new CheckoutError("Selected payment method is not available.");

  // UAE compliance: the customer must declare they may print what they upload / design (rejected with 400 rights_declaration_required)
  const needsDeclaration = requiresRightsDeclaration(input.lines);
  if (needsDeclaration && input.rightsDeclared !== true)
    throw new CheckoutError("Please confirm that you own this content or have the right to print it.", 400, "rights_declaration_required");

  const ds = deliverySettings(tenant);
  const productIds = [...new Set(input.lines.map((l) => l.productId))];
  const products = await db.select(storefrontColumns).from(schema.products)
    .where(and(eq(schema.products.tenantId, tenant.id), inArray(schema.products.id, productIds), eq(schema.products.active, true)));
  const byId = new Map(products.map((p) => [p.id, p]));

  const allFileIds = [...new Set(input.lines.flatMap((l) => l.fileIds))];
  const files = allFileIds.length
    ? await db.select().from(schema.files).where(and(eq(schema.files.tenantId, tenant.id), inArray(schema.files.id, allFileIds), isNull(schema.files.orderId), isNull(schema.files.deletedAt)))
    : [];
  if (files.length !== allFileIds.length) throw new CheckoutError("One of your uploaded files is no longer available. Please re-upload it.");

  const items = input.lines.map((l) => {
    const p = byId.get(l.productId);
    if (!p) throw new CheckoutError("A product in your cart is no longer available.");
    const design = isDesign(l.design) ? l.design : undefined;
    if (p.config.requiresUpload && !l.fileIds.length) throw new CheckoutError(`Please upload a file for ${p.name}.`);
    if (p.config.designer && !design && !l.fileIds.length) throw new CheckoutError(`Please design or upload artwork for ${p.name}.`);
    if (p.config.personalisation?.artwork === "required" && !l.fileIds.length) throw new CheckoutError(`Please upload your artwork for ${p.name}.`);
    let price;
    try { price = computeLinePrice(p.config, l.selections, l.quantity, l.pages); }
    catch (e) { throw new CheckoutError(e instanceof PricingError ? `${p.name}: ${e.message}` : "Pricing failed"); }
    return {
      product: p, quantity: l.quantity, pages: p.config.perPage ? Math.max(1, l.pages) : 1,
      selections: l.selections, labels: price.labels, design, fileIds: l.fileIds,
      unitPrice: price.unitPrice, lineTotal: price.lineTotal,
    };
  });

  const turnaround = Math.max(...items.map((i) => i.product.turnaroundHours ?? 24));
  let deliveryFee = 0;
  let lead = turnaround;
  let pickupLocationId: string | null = null;
  const subtotal = round2(items.reduce((a, i) => a + i.lineTotal, 0));

  if (input.fulfillment === "delivery") {
    if (!ds.enabled) throw new CheckoutError("Delivery is not available for this shop.");
    if (!input.address) throw new CheckoutError("Please enter a delivery address.");
    const zone = await db.query.deliveryZones.findFirst({
      where: and(eq(schema.deliveryZones.tenantId, tenant.id), eq(schema.deliveryZones.emirate, input.address.emirate), eq(schema.deliveryZones.active, true)),
    });
    if (!zone) throw new CheckoutError(`Sorry, we don't deliver to ${input.address.emirate} yet.`);
    deliveryFee = zone.freeAbove != null && subtotal >= zone.freeAbove ? 0 : zone.fee;
    lead = Math.max(turnaround, zone.minLeadHours);
  } else {
    if (!ds.pickupEnabled) throw new CheckoutError("Pickup is not available for this shop.");
    const loc = input.pickupLocationId
      ? await db.query.pickupLocations.findFirst({ where: and(eq(schema.pickupLocations.id, input.pickupLocationId), eq(schema.pickupLocations.tenantId, tenant.id), eq(schema.pickupLocations.active, true)) })
      : undefined;
    if (!loc) throw new CheckoutError("Please choose a pickup location.");
    pickupLocationId = loc.id;
  }

  const slot = findSlot(generateSlots(ds, lead), input.slotStart);
  if (!slot) throw new CheckoutError("The selected time slot is no longer available. Please pick another one.");

  const vatRate = tenant.settings?.vatRate ?? 5;
  const totals = computeOrderTotals(items.map((i) => i.lineTotal), deliveryFee, vatRate, !!tenant.settings?.pricesIncludeVat);
  const prefix = (tenant.settings?.orderPrefix || tenant.slug.slice(0, 3)).toUpperCase();

  return db.transaction(async (tx) => {
    // serialize order numbering per tenant
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${tenant.id}))`);
    const [{ n }] = await tx.select({ n: sql<number>`coalesce(max(nullif(substring(${schema.orders.number} from '([0-9]+)$'), '')::bigint), 10000)::bigint` })
      .from(schema.orders).where(eq(schema.orders.tenantId, tenant.id));
    const number = `${prefix}-${Math.max(10000, Number(n)) + 1}`;
    const addr = input.address ? { ...input.address, emirate: input.address.emirate as (typeof EMIRATES)[number], name: input.contact.name, phone: input.contact.phone } : null;
    const [order] = await tx.insert(schema.orders).values({
      tenantId: tenant.id, number, customerId,
      customerName: input.contact.name, customerEmail: input.contact.email.toLowerCase(), customerPhone: input.contact.phone,
      status: "pending_payment", fulfillment: input.fulfillment, pickupLocationId,
      deliveryAddress: addr, slotStart: new Date(slot.start), slotEnd: new Date(slot.end),
      subtotal: totals.subtotal, deliveryFee: totals.deliveryFee, discount: totals.discount, vat: totals.vat, total: totals.total,
      currency: "AED", paymentProvider: input.provider, notes: input.notes || null,
      ...(needsDeclaration ? { rightsDeclaredAt: new Date(), rightsDeclarationVersion: RIGHTS_DECLARATION_VERSION } : {}),
    }).returning();
    if (needsDeclaration) {
      await tx.insert(schema.consentLogs).values({
        tenantId: tenant.id, userId: customerId,
        subjectKey: createHash("sha256").update(input.contact.email.toLowerCase()).digest("hex"),
        purpose: "rights_declaration", granted: true, version: RIGHTS_DECLARATION_VERSION,
      });
    }
    await tx.insert(schema.orderItems).values(items.map((i) => ({
      orderId: order.id, productId: i.product.id, productName: i.product.name, kind: i.product.kind,
      quantity: i.quantity, pages: i.pages, selections: i.selections, selectionLabels: i.labels,
      design: i.design ?? null, fileIds: i.fileIds, unitPrice: i.unitPrice, lineTotal: i.lineTotal,
    })));
    if (allFileIds.length) await tx.update(schema.files).set({ orderId: order.id }).where(inArray(schema.files.id, allFileIds));
    await tx.insert(schema.orderEvents).values({ orderId: order.id, status: "pending_payment", message: "Order placed, awaiting payment" });
    return order;
  });
}

export { publicOrigin } from "@/lib/origin";

/** `returnPath` lets walk-in orders come back to their own status page instead of the normal order page. */
export async function startPayment(tenant: Tenant, order: Order, provider: ProviderCode, origin: string, returnPath?: string) {
  const base = `${origin}${returnPath ?? `/s/${tenant.slug}/orders/${order.id}`}?t=${orderToken(order.id)}`;
  return createCheckout(tenant, order, provider, { successUrl: `${base}&paid=1`, cancelUrl: `${base}&cancelled=1` });
}


/* ---------- walk-in (QR queue) orders ---------- */
export const WalkInFile = z.object({
  fileId: z.string().uuid(),
  copies: z.number().int().min(1).max(200).default(1),
  color: z.enum(["bw", "color"]).default("bw"),
  sides: z.enum(["single", "double"]).default("single"),
  paperSize: z.string().min(1).max(30).default("A4"),
  /** only used when the server could not count pages itself (Word/PowerPoint/Excel) */
  pages: z.number().int().min(1).max(2000).optional(),
});
export const WalkInCheckoutInput = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(7).max(30),
  files: z.array(WalkInFile).min(1).max(50),
  provider: z.literal("stripe").default("stripe"),
});
export type WalkInCheckoutInputT = z.infer<typeof WalkInCheckoutInput>;

/** Return path (without token) of the walk-in status page for an order. */
export const walkInStatusPath = (slug: string, orderId: string) => `/s/${slug}/walk-in/status/${orderId}`;

/**
 * Creates a pending_payment walk-in order + awaiting_payment print jobs in one transaction.
 * Prices are recomputed server-side; page counts come from the stored file whenever known.
 * The jobs only enter the print queue when markOrderPaid fires (enqueueOrderJobs), which also counts the visit.
 */
export async function createWalkInOrder(tenant: Tenant, input: WalkInCheckoutInputT) {
  await assertTenantCanTakeOrders(tenant);
  const gate = await walkInGate(tenant);
  if (!gate.ok) throw new CheckoutError("Walk-in printing isn't available at this shop.", 403);
  const settings = walkInSettings(tenant);
  if (input.files.length > settings.maxFilesPerVisit) throw new CheckoutError(`You can print up to ${settings.maxFilesPerVisit} files per visit.`);
  if (new Set(input.files.map((f) => f.fileId)).size !== input.files.length) throw new CheckoutError("The same file was added twice.");
  const phone = normalizePhone(input.phone);
  if (!phone) throw new CheckoutError("Please enter a valid mobile number.");
  if (!(await enabledProviders(tenant)).includes(input.provider as ProviderCode)) throw new CheckoutError("Selected payment method is not available.");

  const product = await getWalkInProduct(tenant);
  if (!product || product.kind !== "document") throw new CheckoutError("Walk-in printing isn't set up at this shop yet.", 403);

  const ids = input.files.map((f) => f.fileId);
  const files = await db.select().from(schema.files)
    .where(and(eq(schema.files.tenantId, tenant.id), inArray(schema.files.id, ids), isNull(schema.files.orderId), isNull(schema.files.deletedAt)));
  const fileById = new Map(files.map((f) => [f.id, f]));
  if (files.length !== ids.length) throw new CheckoutError("One of your files is no longer available. Please upload it again.");

  const group = (key: string) => product.config.optionGroups.find((g) => g.key === key);
  const items = input.files.map((l) => {
    const f = fileById.get(l.fileId)!;
    if (f.confidential || !isWalkInExtension(f.filename)) throw new CheckoutError(`${f.filename}: this file type can't be printed through the walk-in queue.`);
    const verified = f.pageCount != null;
    const pages = verified ? f.pageCount! : l.pages;
    if (!pages) throw new CheckoutError(`${f.filename}: please enter the number of pages.`);
    // map the customer's choices onto the product's own option groups; reject values the shop doesn't offer
    const selections: Record<string, string> = {};
    for (const [key, value] of [["paper_size", l.paperSize], ["color", l.color], ["sides", l.sides]] as const) {
      const g = group(key);
      if (!g) continue;
      if (!g.choices.some((c) => c.value === value)) throw new CheckoutError(`${f.filename}: "${value}" isn't available for ${g.label}.`);
      selections[key] = value;
    }
    let price;
    try { price = computeLinePrice(product.config, selections, l.copies, pages); }
    catch (e) { throw new CheckoutError(e instanceof PricingError ? `${f.filename}: ${e.message}` : "Pricing failed"); }
    return { file: f, copies: l.copies, pages, verified, selections, price, options: { color: l.color, sides: l.sides, paperSize: l.paperSize } };
  });

  const vatRate = tenant.settings?.vatRate ?? 5;
  const totals = computeOrderTotals(items.map((i) => i.price.lineTotal), 0, vatRate, !!tenant.settings?.pricesIncludeVat);
  const prefix = (tenant.settings?.orderPrefix || tenant.slug.slice(0, 3)).toUpperCase();

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${tenant.id}))`); // same lock as createOrder: numbering + tickets
    const [{ n }] = await tx.select({ n: sql<number>`coalesce(max(nullif(substring(${schema.orders.number} from '([0-9]+)$'), '')::bigint), 10000)::bigint` })
      .from(schema.orders).where(eq(schema.orders.tenantId, tenant.id));
    const number = `${prefix}-${Math.max(10000, Number(n)) + 1}`;
    const ticketNo = await nextTicketNo(tx, tenant.id);
    // visits/spend are NOT bumped here — enqueueOrderJobs does that once payment succeeds
    const [cust] = await tx.insert(schema.walkInCustomers).values({ tenantId: tenant.id, phone, name: input.name })
      .onConflictDoUpdate({ target: [schema.walkInCustomers.tenantId, schema.walkInCustomers.phone], set: { name: input.name, lastSeenAt: new Date() } }).returning();
    const [order] = await tx.insert(schema.orders).values({
      tenantId: tenant.id, number, customerId: null, customerName: input.name, customerEmail: "walk-in@invalid", customerPhone: phone,
      status: "pending_payment", fulfillment: "pickup", pickupLocationId: null, slotStart: null, slotEnd: null,
      subtotal: totals.subtotal, deliveryFee: 0, discount: 0, vat: totals.vat, total: totals.total,
      currency: "AED", paymentProvider: input.provider, source: "walk_in", walkInCustomerId: cust.id, ticketNo,
    }).returning();
    const rows = await tx.insert(schema.orderItems).values(items.map((i) => ({
      orderId: order.id, productId: product.id, productName: product.name, kind: product.kind,
      quantity: i.copies, pages: i.pages, selections: i.selections, selectionLabels: i.price.labels,
      fileIds: [i.file.id], unitPrice: i.price.unitPrice, lineTotal: i.price.lineTotal,
    }))).returning();
    await tx.update(schema.files).set({ orderId: order.id }).where(inArray(schema.files.id, ids));
    await tx.insert(schema.orderEvents).values({ orderId: order.id, status: "pending_payment", message: `Walk-in order ${ticketNo} placed, awaiting payment` });
    await createPrintJobs(tx, tenant.id, order.id, ticketNo, items.map((i, idx) => ({
      orderItemId: rows[idx]?.id, fileId: i.file.id, filename: i.file.filename, copies: i.copies, pages: i.pages, pagesVerified: i.verified, options: i.options,
    })));
    return order;
  });
}
