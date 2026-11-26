import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { normalizePhone } from "@/lib/phone";
import { rateLimit } from "@/server/billing/rate-limit";
import { PERSONALISATION_PREFIX, type ProductConfig } from "@/lib/types";

export const QUOTE_STATUSES = ["new", "replied", "won", "lost"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
export const QUOTE_LIMIT_PER_HOUR = 5;

const Selections = z.record(z.string().max(60), z.string().max(300)).refine((o) => Object.keys(o).length <= 40, "Too many selections");

export const QuoteInput = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(120),
  phone: z.string().trim().min(7, "Please enter your mobile number").max(30),
  email: z.union([z.literal(""), z.string().trim().email("Please enter a valid email").max(200)]).optional(),
  message: z.string().trim().min(5, "Please tell the shop what you need").max(1000, "Message can be at most 1000 characters"),
  quantity: z.number().int().min(1).max(10_000_000).nullish(),
  productId: z.string().uuid().nullish(),
  selections: Selections.optional(),
  fileIds: z.array(z.string().uuid()).max(10).optional(),
  /** honeypot: real users never fill this in */
  website: z.string().max(200).optional(),
});

export type QuoteResult = { ok: true; id: string | null } | { ok: false; status: number; error: string };

/** Validate + store a quote request for a tenant. `ip` is only used as part of the rate-limit key. */
export async function submitQuote(tenant: { id: string; status: string }, ip: string, raw: unknown): Promise<QuoteResult> {
  if (tenant.status === "suspended" || tenant.status === "cancelled") return { ok: false, status: 404, error: "Store not found" };
  const parsed = QuoteInput.safeParse(raw);
  if (!parsed.success) return { ok: false, status: 400, error: parsed.error.issues[0]?.message ?? "Please check the form" };
  const d = parsed.data;
  if (d.website) return { ok: true, id: null }; // honeypot tripped: pretend success, store nothing
  if (!rateLimit(`quote:${tenant.id}:${ip}`, QUOTE_LIMIT_PER_HOUR, 60 * 60_000)) return { ok: false, status: 429, error: "Too many requests. Please try again later or contact the shop directly." };
  const phone = normalizePhone(d.phone);
  if (!phone) return { ok: false, status: 400, error: "Please enter a valid UAE mobile number" };

  let productName: string | null = null;
  if (d.productId) {
    const p = await db.query.products.findFirst({ where: and(eq(schema.products.id, d.productId), eq(schema.products.tenantId, tenant.id)) });
    if (!p) return { ok: false, status: 400, error: "Product not found" };
    productName = p.name;
  }
  const ids = [...new Set(d.fileIds ?? [])];
  const fileIds = ids.length
    ? (await db.select({ id: schema.files.id }).from(schema.files).where(and(eq(schema.files.tenantId, tenant.id), inArray(schema.files.id, ids), isNull(schema.files.orderId), isNull(schema.files.deletedAt)))).map((f) => f.id)
    : [];
  const [row] = await db.insert(schema.quoteRequests).values({
    tenantId: tenant.id, productId: d.productId ?? null, productName, name: d.name, phone, email: d.email || null,
    message: d.message, quantity: d.quantity ?? null, selections: d.selections ?? {}, fileIds,
  }).returning({ id: schema.quoteRequests.id });
  await db.insert(schema.auditLogs).values({ action: "quote.received", tenantId: tenant.id, meta: { quoteId: row.id, productId: d.productId ?? null, files: fileIds.length } });
  return { ok: true, id: row.id };
}

export async function listQuotes(tenantId: string, status?: QuoteStatus) {
  return db.select().from(schema.quoteRequests)
    .where(status ? and(eq(schema.quoteRequests.tenantId, tenantId), eq(schema.quoteRequests.status, status)) : eq(schema.quoteRequests.tenantId, tenantId))
    .orderBy(desc(schema.quoteRequests.createdAt)).limit(200);
}

export async function quoteCounts(tenantId: string): Promise<Record<QuoteStatus, number>> {
  const rows = await db.select({ status: schema.quoteRequests.status, n: count() }).from(schema.quoteRequests).where(eq(schema.quoteRequests.tenantId, tenantId)).groupBy(schema.quoteRequests.status);
  const out = { new: 0, replied: 0, won: 0, lost: 0 } as Record<QuoteStatus, number>;
  for (const r of rows) if ((QUOTE_STATUSES as readonly string[]).includes(r.status)) out[r.status as QuoteStatus] = r.n;
  return out;
}
export async function newQuoteCount(tenantId: string) {
  const [r] = await db.select({ n: count() }).from(schema.quoteRequests).where(and(eq(schema.quoteRequests.tenantId, tenantId), eq(schema.quoteRequests.status, "new")));
  return r?.n ?? 0;
}

/** Tenant-scoped status change. Returns the updated row, or null when the quote does not belong to the tenant. */
export async function setQuoteStatus(tenantId: string, quoteId: string, status: string) {
  if (!(QUOTE_STATUSES as readonly string[]).includes(status)) return null;
  if (!/^[0-9a-f-]{36}$/i.test(quoteId)) return null;
  const [row] = await db.update(schema.quoteRequests).set({ status })
    .where(and(eq(schema.quoteRequests.id, quoteId), eq(schema.quoteRequests.tenantId, tenantId))).returning();
  return row ?? null;
}

/** Files attached to a quote, tenant-scoped. */
export async function quoteFiles(tenantId: string, ids: string[]) {
  if (!ids.length) return [];
  return db.select({ id: schema.files.id, filename: schema.files.filename, size: schema.files.size, deletedAt: schema.files.deletedAt })
    .from(schema.files).where(and(eq(schema.files.tenantId, tenantId), inArray(schema.files.id, ids)));
}

/** Human readable selections: option group label -> choice label, personalisation field labels. */
export function describeSelections(config: ProductConfig | null | undefined, selections: Record<string, string>): { label: string; value: string }[] {
  return Object.entries(selections ?? {}).filter(([, v]) => v !== "").map(([k, v]) => {
    const g = config?.optionGroups?.find((x) => x.key === k);
    if (g) return { label: g.label, value: g.choices.find((c) => c.value === v)?.label ?? v };
    if (k.startsWith(PERSONALISATION_PREFIX)) {
      const f = config?.personalisation?.fields.find((x) => x.key === k.slice(PERSONALISATION_PREFIX.length));
      return { label: f?.label ?? k.slice(PERSONALISATION_PREFIX.length), value: v };
    }
    return { label: k, value: v };
  });
}

export function whatsappReplyUrl(phoneE164: string, shopName: string, customer: string, product: string | null) {
  const text = `Hi ${customer}, this is ${shopName} replying to your quote request${product ? ` for ${product}` : ""}.`;
  return `https://wa.me/${phoneE164.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}
