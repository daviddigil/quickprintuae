/** Credit notes: VAT maths (pure) and gapless / concurrent-safe / idempotent numbering (DB). Run via `npm test`. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createDb } from "@/db/client";
import { provisionTenant } from "@/server/provision";
import { creditNoteAmounts, formatCreditNoteNumber, vatOfGross } from "@/lib/credit-note-math";
import { issueOrderCreditNote, issueSaasCreditNote, taxRecordRows, taxRecordsCsv } from "./credit-notes";
import { setOrderStatus } from "./orders";

const suffix = Date.now().toString(36);
const created: string[] = [];
after(async () => { for (const id of created) await db.delete(schema.tenants).where(eq(schema.tenants.id, id)); });

test("VAT maths: UAE 5%, AED, 2 dp, proportional for partial credits", () => {
  assert.deepEqual(creditNoteAmounts(105, 105, 5), { subtotal: 100, vat: 5, total: 105 });
  assert.deepEqual(creditNoteAmounts(52.5, 105, 5), { subtotal: 50, vat: 2.5, total: 52.5 });
  assert.deepEqual(creditNoteAmounts(10.5, 21, 1), { subtotal: 10, vat: 0.5, total: 10.5 });
  assert.deepEqual(creditNoteAmounts(33.33, 33.33, 0), { subtotal: 33.33, vat: 0, total: 33.33 }, "non-VAT order");
  assert.equal(vatOfGross(105), 5);
  assert.equal(vatOfGross(10.99), 0.52);
  const x = creditNoteAmounts(99.99, 199.98, 9.52);
  assert.equal(x.subtotal + x.vat, x.total);
  assert.equal(String(x.vat).split(".")[1]?.length ?? 0 <= 2, true);
  assert.throws(() => creditNoteAmounts(0, 10, 0));
  assert.throws(() => creditNoteAmounts(-5, 10, 0));
  assert.equal(formatCreditNoteNumber("QP", 7), "QP-CN-00007");
});

async function shop(tag: string) {
  const { tenant } = await provisionTenant(createDb().db, { shopName: `CN ${tag} ${suffix}`, slug: `cn${tag}${suffix}`, ownerName: "O", ownerEmail: `cn${tag}${suffix}@t.ae`, ownerPassword: "pw123456" });
  created.push(tenant.id);
  return tenant;
}
async function paidOrder(tenantId: string, n: number, total = 105, vat = 5) {
  const [o] = await db.insert(schema.orders).values({ tenantId, number: `CN-${suffix}-${n}`, customerName: "C", customerEmail: "c@t.ae", customerPhone: "+971501234567", fulfillment: "pickup", status: "paid", paidAt: new Date(), subtotal: total - vat, vat, total } as never).returning();
  return o;
}

test("order credit notes: sequential per shop, gapless under concurrency, idempotent, linked", async () => {
  const a = await shop("a"), b = await shop("b");
  const orders = await Promise.all(Array.from({ length: 8 }, (_, i) => paidOrder(a.id, i)));
  const results = await Promise.all(orders.map((o) => issueOrderCreditNote(o.id, o.total, "refund")));
  const seqs = results.map((r) => r!.seq).sort((x, y) => x - y);
  assert.deepEqual(seqs, [1, 2, 3, 4, 5, 6, 7, 8], "gapless 1..8 with no duplicates");
  assert.ok(results.every((r, i) => r!.orderId === orders[i].id && r!.vat === 5 && r!.subtotal === 100 && r!.total === 105 && r!.refersTo === orders[i].number));
  assert.match(results[0]!.number, /-CN-0000\d$/);

  // idempotent: same order + amount (also concurrently) returns the same note, no new number consumed
  const again = await Promise.all([issueOrderCreditNote(orders[0].id, 105), issueOrderCreditNote(orders[0].id, 105), issueOrderCreditNote(orders[0].id, 105)]);
  assert.ok(again.every((n) => n!.id === results[0]!.id));
  const notes = await db.select().from(schema.creditNotes).where(eq(schema.creditNotes.tenantId, a.id));
  assert.equal(notes.length, 8);

  // concurrent issue for the SAME new order: exactly one row
  const o9 = await paidOrder(a.id, 99);
  const same = await Promise.all(Array.from({ length: 5 }, () => issueOrderCreditNote(o9.id, 105)));
  assert.equal(new Set(same.map((n) => n!.id)).size, 1);
  assert.equal(same[0]!.seq, 9);

  // another shop has its own scope and starts at 1
  const ob = await paidOrder(b.id, 1);
  assert.equal((await issueOrderCreditNote(ob.id, 105))!.seq, 1);

  // a partial credit for the same order is a separate, proportional note
  const partial = await issueOrderCreditNote(orders[0].id, 52.5, "partial");
  assert.equal(partial!.seq, 10);
  assert.deepEqual([partial!.subtotal, partial!.vat], [50, 2.5]);
});

test("refunding a paid order through setOrderStatus issues exactly one credit note; unpaid cancel issues none", async () => {
  const t = await shop("r");
  const paid = await paidOrder(t.id, 1);
  await setOrderStatus(paid.id, "refunded", "refund");
  await setOrderStatus(paid.id, "refunded", "again");
  const rows = await db.select().from(schema.creditNotes).where(eq(schema.creditNotes.orderId, paid.id));
  assert.equal(rows.length, 1);
  const [unpaid] = await db.insert(schema.orders).values({ tenantId: t.id, number: `CN-${suffix}-u`, customerName: "C", customerEmail: "c@t.ae", customerPhone: "+971501234567", fulfillment: "pickup", status: "pending_payment", subtotal: 10, vat: 0, total: 10 } as never).returning();
  await setOrderStatus(unpaid.id, "cancelled");
  assert.equal((await db.select().from(schema.creditNotes).where(eq(schema.creditNotes.orderId, unpaid.id))).length, 0);
});

test("SaaS credit notes use the platform scope, one per invoice; accountant CSV lists invoices and (negative) credit notes", async () => {
  const t = await shop("s");
  const mk = async (n: number) => (await db.insert(schema.saasInvoices).values({ tenantId: t.id, number: `INV-${suffix}-${n}`, periodStart: new Date(), periodEnd: new Date(), subscriptionAmount: 100, vat: 5, total: 105, status: "void" } as never).returning())[0];
  const [i1, i2] = [await mk(1), await mk(2)];
  const [c1, c2] = await Promise.all([issueSaasCreditNote(i1.id, "void"), issueSaasCreditNote(i2.id, "void")]);
  assert.equal(c1!.scope, "platform");
  assert.equal(Math.abs(c1!.seq - c2!.seq), 1, "consecutive platform numbers");
  assert.deepEqual([c1!.subtotal, c1!.vat, c1!.total], [100, 5, 105]);
  assert.equal((await issueSaasCreditNote(i1.id))!.id, c1!.id, "idempotent");
  const from = new Date(Date.now() - 3600_000), to = new Date(Date.now() + 3600_000);
  const csv = taxRecordsCsv(await taxRecordRows(from, to));
  assert.match(csv, /^document_type,number,date/);
  assert.ok(csv.includes(`INV-${suffix}-1`) && csv.includes(c1!.number));
  assert.ok(csv.includes("credit_note") && csv.includes("-105.00"));
});
