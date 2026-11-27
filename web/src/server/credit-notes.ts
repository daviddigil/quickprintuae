import "server-only";
import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CreditNote } from "@/db/schema";
import { creditNoteAmounts, formatCreditNoteNumber, PLATFORM_SCOPE, tenantScope } from "@/lib/credit-note-math";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function isUniqueViolation(e: unknown): boolean {
  const x = e as { code?: string; cause?: { code?: string } };
  return x?.code === "23505" || x?.cause?.code === "23505";
}

interface IssueArgs {
  scope: string; prefix: string; tenantId: string | null;
  orderId?: string; saasInvoiceId?: string; refersTo: string;
  amounts: { subtotal: number; vat: number; total: number }; reason?: string | null;
  /** how to find an already-issued note for the same document (idempotency) */
  findExisting: (tx: Tx) => Promise<CreditNote | undefined>;
}

/**
 * Inserts one credit note with the next number in its scope. Gapless: the scope is serialised with an advisory lock and the
 * seq is read and inserted in the same transaction (a failure rolls the whole thing back, so no number is ever skipped).
 * A unique-violation (a concurrent issuer of the same order/total) is retried and resolves to the existing note.
 */
async function issue(a: IssueArgs): Promise<{ note: CreditNote; created: boolean }> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"credit_note:" + a.scope}))`);
        const existing = await a.findExisting(tx);
        if (existing) return { note: existing, created: false };
        const [{ n }] = await tx.select({ n: sql<number>`coalesce(max(${schema.creditNotes.seq}), 0)::int` }).from(schema.creditNotes).where(eq(schema.creditNotes.scope, a.scope));
        const seq = n + 1;
        const [note] = await tx.insert(schema.creditNotes).values({
          scope: a.scope, seq, number: formatCreditNoteNumber(a.prefix, seq), tenantId: a.tenantId,
          orderId: a.orderId ?? null, saasInvoiceId: a.saasInvoiceId ?? null, refersTo: a.refersTo,
          subtotal: a.amounts.subtotal, vat: a.amounts.vat, total: a.amounts.total, currency: "AED", reason: a.reason ?? null,
        }).returning();
        return { note, created: true };
      });
    } catch (e) {
      if (isUniqueViolation(e) && attempt < 5) {
        const existing = await a.findExisting(db as unknown as Tx);
        if (existing) return { note: existing, created: false };
        continue;
      }
      throw e;
    }
  }
}

/**
 * Credit note for a shop's paid order that was refunded (called from setOrderStatus). The shop is the issuer, numbering is
 * sequential per shop. Idempotent: the same order + amount never produces a second note.
 */
export async function issueOrderCreditNote(orderId: string, amount: number, reason?: string | null): Promise<CreditNote | null> {
  const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) });
  if (!order) return null;
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, order.tenantId) });
  if (!tenant) return null;
  const amounts = creditNoteAmounts(amount, order.total, order.vat);
  const prefix = (tenant.settings?.orderPrefix || tenant.slug.slice(0, 3)).toUpperCase();
  const { note } = await issue({
    scope: tenantScope(tenant.id), prefix, tenantId: tenant.id, orderId: order.id, refersTo: order.number, amounts, reason,
    findExisting: async (tx) => (await tx.select().from(schema.creditNotes).where(and(eq(schema.creditNotes.orderId, order.id), eq(schema.creditNotes.total, amounts.total))).limit(1))[0],
  });
  return note;
}

/** Credit note (issuer: QuickPrint, platform scope) for a void or refunded SaaS invoice. Credits the full invoice once. */
export async function issueSaasCreditNote(invoiceId: string, reason?: string | null): Promise<CreditNote | null> {
  const inv = await db.query.saasInvoices.findFirst({ where: eq(schema.saasInvoices.id, invoiceId) });
  if (!inv) return null;
  const amounts = creditNoteAmounts(inv.total, inv.total, inv.vat);
  const { note } = await issue({
    scope: PLATFORM_SCOPE, prefix: "QP", tenantId: inv.tenantId, saasInvoiceId: inv.id, refersTo: inv.number, amounts, reason,
    findExisting: async (tx) => (await tx.select().from(schema.creditNotes).where(eq(schema.creditNotes.saasInvoiceId, inv.id)).limit(1))[0],
  });
  return note;
}

export const creditNotesForOrder = (tenantId: string, orderId: string) =>
  db.select().from(schema.creditNotes).where(and(eq(schema.creditNotes.tenantId, tenantId), eq(schema.creditNotes.orderId, orderId))).orderBy(asc(schema.creditNotes.seq));

export const creditNotesForInvoice = (invoiceId: string) =>
  db.select().from(schema.creditNotes).where(eq(schema.creditNotes.saasInvoiceId, invoiceId)).orderBy(asc(schema.creditNotes.seq));

export const recentPlatformCreditNotes = (limit = 100) =>
  db.select().from(schema.creditNotes).where(eq(schema.creditNotes.scope, PLATFORM_SCOPE)).orderBy(desc(schema.creditNotes.seq)).limit(limit);

/* ---------- accountant export ---------- */
const csvCell = (v: unknown) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // CSV/formula injection guard
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const TAX_CSV_HEAD = ["document_type", "number", "date", "issuer_scope", "shop", "refers_to", "subtotal_aed", "vat_aed", "total_aed", "status", "reason"];

/** Pure: rows -> CSV text. Credit notes are shown as negative amounts. */
export function taxRecordsCsv(rows: (string | number | null)[][]): string {
  return [TAX_CSV_HEAD.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n") + "\n";
}

/** SaaS invoices (issued by the platform) and every credit note issued in [from, to). */
export async function taxRecordRows(from: Date, to: Date): Promise<(string | number | null)[][]> {
  const inv = await db.select({ i: schema.saasInvoices, shop: schema.tenants.name }).from(schema.saasInvoices)
    .innerJoin(schema.tenants, eq(schema.tenants.id, schema.saasInvoices.tenantId))
    .where(and(gte(schema.saasInvoices.createdAt, from), lt(schema.saasInvoices.createdAt, to))).orderBy(asc(schema.saasInvoices.createdAt));
  const cn = await db.select({ c: schema.creditNotes, shop: schema.tenants.name }).from(schema.creditNotes)
    .leftJoin(schema.tenants, eq(schema.tenants.id, schema.creditNotes.tenantId))
    .where(and(gte(schema.creditNotes.issuedAt, from), lt(schema.creditNotes.issuedAt, to))).orderBy(asc(schema.creditNotes.issuedAt));
  const rows: (string | number | null)[][] = [];
  for (const { i, shop } of inv) {
    rows.push(["saas_invoice", i.number, i.createdAt.toISOString(), "platform", shop, "", (i.total - i.vat).toFixed(2), i.vat.toFixed(2), i.total.toFixed(2), i.status, ""]);
  }
  for (const { c, shop } of cn) {
    rows.push(["credit_note", c.number, c.issuedAt.toISOString(), c.scope, shop ?? "", c.refersTo, (-c.subtotal).toFixed(2), (-c.vat).toFixed(2), (-c.total).toFixed(2), "issued", c.reason ?? ""]);
  }
  return rows;
}
