import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import bcrypt from "bcryptjs";
import { dsrDueAt, type DsrKind } from "@/lib/compliance";
import { deleteFile } from "./storage";

/**
 * PDPL data-subject rights. Shops are the controllers of their customers' data; the platform is the processor.
 * Everything here is tenant-scoped and scoped to ONE customer. Audit logging happens in the calling server actions
 * (this module has no request context so it stays unit-testable).
 */

export const ERASED_NAME = "Deleted customer";
export const erasedEmail = (userId: string) => `deleted+${userId}@invalid`;

/* ---------- request workflow ---------- */
export const DSR_TRANSITIONS: Record<string, string[]> = {
  requested: ["in_progress", "completed", "rejected"],
  in_progress: ["completed", "rejected"],
  completed: [],
  rejected: [],
};
export const canMoveDsr = (from: string, to: string) => (DSR_TRANSITIONS[from] ?? []).includes(to);
export const isDsrOverdue = (r: { status: string; dueAt: Date }, now = new Date()) =>
  (r.status === "requested" || r.status === "in_progress") && r.dueAt.getTime() < now.getTime();

/** Files a request. An identical open request (same tenant, requester, kind) is returned instead of duplicated. */
export async function createDataSubjectRequest(input: { tenantId: string | null; userId?: string | null; email: string; kind: DsrKind; note?: string | null }) {
  const email = input.email.trim().toLowerCase();
  const existing = await db.query.dataSubjectRequests.findFirst({
    where: and(
      input.tenantId ? eq(schema.dataSubjectRequests.tenantId, input.tenantId) : isNull(schema.dataSubjectRequests.tenantId),
      eq(schema.dataSubjectRequests.requesterEmail, email), eq(schema.dataSubjectRequests.kind, input.kind),
      inArray(schema.dataSubjectRequests.status, ["requested", "in_progress"]),
    ),
  });
  if (existing) return { request: existing, created: false };
  const [request] = await db.insert(schema.dataSubjectRequests).values({
    tenantId: input.tenantId, userId: input.userId ?? null, requesterEmail: email, kind: input.kind,
    note: input.note?.slice(0, 2000) || null, dueAt: dsrDueAt(),
  }).returning();
  return { request, created: true };
}

export async function updateDataSubjectRequest(id: string, scope: { tenantId: string | null }, patch: { status: string; resolution?: string | null }, handledBy: string) {
  const r = await db.query.dataSubjectRequests.findFirst({
    where: and(eq(schema.dataSubjectRequests.id, id), scope.tenantId ? eq(schema.dataSubjectRequests.tenantId, scope.tenantId) : isNull(schema.dataSubjectRequests.tenantId)),
  });
  if (!r) return { ok: false as const, error: "Request not found" };
  if (!canMoveDsr(r.status, patch.status)) return { ok: false as const, error: `Cannot move from ${r.status} to ${patch.status}` };
  if ((patch.status === "completed" || patch.status === "rejected") && !patch.resolution?.trim()) return { ok: false as const, error: "A resolution note is required" };
  const done = patch.status === "completed" || patch.status === "rejected";
  const [row] = await db.update(schema.dataSubjectRequests).set({
    status: patch.status, resolution: patch.resolution?.trim().slice(0, 2000) || r.resolution, handledBy,
    completedAt: done ? new Date() : null, updatedAt: new Date(),
  }).where(eq(schema.dataSubjectRequests.id, id)).returning();
  return { ok: true as const, request: row, before: r };
}

/* ---------- export (access / portability) ---------- */
/** Files that belong to this customer: uploaded by them, or attached to their orders / quote requests. Same tenant only. */
async function customerFiles(tenantId: string, userId: string, orderIds: string[], quoteFileIds: string[]) {
  const items = orderIds.length ? await db.select({ fileIds: schema.orderItems.fileIds }).from(schema.orderItems).where(inArray(schema.orderItems.orderId, orderIds)) : [];
  const ids = [...new Set([...items.flatMap((i) => i.fileIds), ...quoteFileIds])];
  return db.select().from(schema.files).where(and(
    eq(schema.files.tenantId, tenantId),
    ids.length ? sql`(${schema.files.userId} = ${userId} or ${schema.files.id} in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)}))` : eq(schema.files.userId, userId),
  ));
}

async function customerQuotes(tenantId: string, email: string) {
  return db.select().from(schema.quoteRequests).where(and(eq(schema.quoteRequests.tenantId, tenantId), sql`lower(${schema.quoteRequests.email}) = ${email.toLowerCase()}`));
}

/** JSON export of ONE customer's data in ONE shop. Returns null when the user is not a customer of that tenant. */
export async function exportCustomerData(tenantId: string, userId: string) {
  const user = await db.query.users.findFirst({ where: and(eq(schema.users.id, userId), eq(schema.users.tenantId, tenantId), eq(schema.users.role, "customer")) });
  if (!user) return null;
  const orders = await db.select().from(schema.orders).where(and(eq(schema.orders.tenantId, tenantId), eq(schema.orders.customerId, userId)));
  const orderIds = orders.map((o) => o.id);
  const items = orderIds.length ? await db.select().from(schema.orderItems).where(inArray(schema.orderItems.orderId, orderIds)) : [];
  const quotes = await customerQuotes(tenantId, user.email);
  const files = await customerFiles(tenantId, userId, orderIds, quotes.flatMap((q) => q.fileIds));
  const consents = await db.select().from(schema.consentLogs).where(and(eq(schema.consentLogs.tenantId, tenantId), eq(schema.consentLogs.userId, userId)));
  return {
    exportedAt: new Date().toISOString(),
    shop: tenantId,
    profile: { id: user.id, name: user.name, email: user.email, phone: user.phone, marketingOptIn: user.marketingOptIn, marketingOptInAt: user.marketingOptInAt, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt },
    orders: orders.map((o) => ({
      id: o.id, number: o.number, status: o.status, createdAt: o.createdAt, fulfillment: o.fulfillment, deliveryAddress: o.deliveryAddress,
      customerName: o.customerName, customerEmail: o.customerEmail, customerPhone: o.customerPhone, notes: o.notes,
      subtotal: o.subtotal, deliveryFee: o.deliveryFee, discount: o.discount, vat: o.vat, total: o.total, currency: o.currency, paidAt: o.paidAt,
      rightsDeclaredAt: o.rightsDeclaredAt,
      items: items.filter((i) => i.orderId === o.id).map((i) => ({ id: i.id, productName: i.productName, quantity: i.quantity, pages: i.pages, selections: i.selectionLabels, unitPrice: i.unitPrice, lineTotal: i.lineTotal })),
    })),
    quoteRequests: quotes.map((q) => ({ id: q.id, productName: q.productName, name: q.name, phone: q.phone, email: q.email, message: q.message, quantity: q.quantity, status: q.status, createdAt: q.createdAt })),
    uploadedFiles: files.map((f) => ({ id: f.id, filename: f.filename, mime: f.mime, size: f.size, confidential: f.confidential, uploadedAt: f.createdAt, deletedAt: f.deletedAt })),
    consents: consents.map((c) => ({ purpose: c.purpose, granted: c.granted, version: c.version, at: c.createdAt })),
  };
}

/* ---------- erasure ---------- */
export type EraseResult =
  | { ok: true; alreadyErased: boolean; filesDeleted: number; ordersAnonymised: number }
  | { ok: false; reason: "not_found" | "legal_hold" };

/**
 * Anonymises one customer. KEEPS the financial rows (orders, order items, totals, invoices are generated from the order)
 * because tax record-keeping applies. REFUSES while the shop or any of the customer's orders is under legal hold. Idempotent.
 */
export async function eraseCustomer(tenantId: string, userId: string): Promise<EraseResult> {
  const user = await db.query.users.findFirst({ where: and(eq(schema.users.id, userId), eq(schema.users.tenantId, tenantId), eq(schema.users.role, "customer")) });
  if (!user) return { ok: false, reason: "not_found" };
  if (user.anonymisedAt) return { ok: true, alreadyErased: true, filesDeleted: 0, ordersAnonymised: 0 };
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId) });
  if (!tenant) return { ok: false, reason: "not_found" };
  const orders = await db.select().from(schema.orders).where(and(eq(schema.orders.tenantId, tenantId), eq(schema.orders.customerId, userId)));
  if (tenant.legalHold || orders.some((o) => o.legalHold)) return { ok: false, reason: "legal_hold" };

  const orderIds = orders.map((o) => o.id);
  const quotes = await customerQuotes(tenantId, user.email);
  const files = await customerFiles(tenantId, userId, orderIds, quotes.flatMap((q) => q.fileIds));
  for (const f of files) await deleteFile(f.storageKey); // storage first: a failure leaves the DB intact so the erase can be retried
  const email = erasedEmail(userId);
  const newHash = await bcrypt.hash(randomBytes(32).toString("hex"), 10);

  await db.transaction(async (tx) => {
    const fileIds = files.map((f) => f.id);
    if (fileIds.length) await tx.delete(schema.files).where(and(eq(schema.files.tenantId, tenantId), inArray(schema.files.id, fileIds)));
    if (orderIds.length) {
      await tx.update(schema.orders).set({ customerName: ERASED_NAME, customerEmail: email, customerPhone: "", deliveryAddress: null, notes: null, internalNotes: null, updatedAt: new Date() })
        .where(and(eq(schema.orders.tenantId, tenantId), inArray(schema.orders.id, orderIds)));
      for (const it of await tx.select({ id: schema.orderItems.id, fileIds: schema.orderItems.fileIds }).from(schema.orderItems).where(inArray(schema.orderItems.orderId, orderIds))) {
        if (it.fileIds.length) await tx.update(schema.orderItems).set({ fileIds: [] }).where(eq(schema.orderItems.id, it.id));
      }
    }
    for (const q of quotes) {
      await tx.update(schema.quoteRequests).set({ name: ERASED_NAME, phone: "", email: null, message: "[erased on request]", fileIds: [] }).where(eq(schema.quoteRequests.id, q.id));
    }
    await tx.update(schema.consentLogs).set({ userId: null, subjectKey: null, ipHash: null }).where(and(eq(schema.consentLogs.tenantId, tenantId), eq(schema.consentLogs.userId, userId)));
    await tx.update(schema.dataSubjectRequests).set({ requesterEmail: email, note: null }).where(and(eq(schema.dataSubjectRequests.tenantId, tenantId), eq(schema.dataSubjectRequests.userId, userId)));
    await tx.update(schema.users).set({
      name: ERASED_NAME, email, phone: null, emailCanonical: null, phoneCanonical: null, passwordHash: newHash,
      totpSecretEnc: null, recoveryCodesHash: [], active: false, marketingOptIn: false, anonymisedAt: new Date(),
    }).where(and(eq(schema.users.id, userId), eq(schema.users.tenantId, tenantId)));
  });
  return { ok: true, alreadyErased: false, filesDeleted: files.length, ordersAnonymised: orders.length };
}
