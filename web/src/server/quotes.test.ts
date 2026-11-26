/** DB-backed. Run via `npm test`. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createDb } from "@/db/client";
import { provisionTenant } from "@/server/provision";
import { submitQuote, setQuoteStatus, listQuotes, newQuoteCount, describeSelections, QUOTE_LIMIT_PER_HOUR } from "./quotes";

const suffix = Date.now().toString(36);
const created: string[] = [];
async function shop() {
  const { tenant: t } = await provisionTenant(createDb().db, { shopName: `Q ${suffix}`, slug: `qt${suffix}${created.length}`, ownerName: "O", ownerEmail: `q${created.length}${suffix}@t.ae`, ownerPassword: "pw123456" });
  created.push(t.id);
  return t;
}
after(async () => { for (const id of created) await db.delete(schema.tenants).where(eq(schema.tenants.id, id)); });
const good = { name: "Sara", phone: "0501234567", message: "Need 40 custom gift boxes", quantity: 40 };

test("creates a quote with normalised phone, product name and only own-tenant files", async () => {
  const a = await shop(); const b = await shop();
  const [p] = await db.insert(schema.products).values({ tenantId: a.id, kind: "merchandise", name: "Gift Pack", slug: `gp${suffix}`, config: { tiers: [], optionGroups: [] } } as never).returning();
  const [fa] = await db.insert(schema.files).values({ tenantId: a.id, filename: "a.png", storageKey: "x", mime: "image/png", size: 1 }).returning();
  const [fb] = await db.insert(schema.files).values({ tenantId: b.id, filename: "b.png", storageKey: "y", mime: "image/png", size: 1 }).returning();
  const r = await submitQuote(a, "1.1.1.1", { ...good, productId: p.id, fileIds: [fa.id, fb.id], selections: { size: "m" } });
  assert.ok(r.ok && r.id);
  const [q] = await listQuotes(a.id);
  assert.equal(q.phone, "+971501234567"); assert.equal(q.productName, "Gift Pack"); assert.equal(q.status, "new");
  assert.deepEqual(q.fileIds, [fa.id]);
  assert.equal(await newQuoteCount(a.id), 1);
});

test("validation: bad phone, long message, honeypot, suspended shop", async () => {
  const a = await shop();
  assert.equal((await submitQuote(a, "2.2.2.2", { ...good, phone: "abc12345" }) as { status: number }).status, 400);
  assert.equal((await submitQuote(a, "2.2.2.2", { ...good, message: "x".repeat(1001) }) as { status: number }).status, 400);
  const hp = await submitQuote(a, "2.2.2.2", { ...good, website: "http://spam" });
  assert.ok(hp.ok && hp.id === null);
  assert.equal((await listQuotes(a.id)).length, 0);
  assert.equal((await submitQuote({ ...a, status: "suspended" }, "2.2.2.2", good) as { status: number }).status, 404);
});

test("rate limit: more than 5 per hour per IP+shop is rejected with 429", async () => {
  const a = await shop();
  for (let i = 0; i < QUOTE_LIMIT_PER_HOUR; i++) assert.ok((await submitQuote(a, "3.3.3.3", good)).ok);
  assert.equal((await submitQuote(a, "3.3.3.3", good) as { status: number }).status, 429);
  assert.ok((await submitQuote(a, "4.4.4.4", good)).ok, "different IP is unaffected");
});

test("tenant isolation: foreign productId rejected; shop B cannot read or modify shop A quotes", async () => {
  const a = await shop(); const b = await shop();
  const [pb] = await db.insert(schema.products).values({ tenantId: b.id, kind: "merchandise", name: "B Mug", slug: `bm${suffix}`, config: { tiers: [], optionGroups: [] } } as never).returning();
  const bad = await submitQuote(a, "5.5.5.5", { ...good, productId: pb.id });
  assert.ok(!bad.ok && bad.status === 400);
  const r = await submitQuote(a, "5.5.5.5", good);
  assert.ok(r.ok && r.id);
  assert.equal((await listQuotes(b.id)).length, 0);
  assert.equal(await newQuoteCount(b.id), 0);
  assert.equal(await setQuoteStatus(b.id, r.id!, "won"), null);
  assert.equal((await listQuotes(a.id))[0].status, "new");
});

test("status updates only accept known statuses", async () => {
  const a = await shop();
  const r = await submitQuote(a, "6.6.6.6", good);
  assert.ok(r.ok && r.id);
  assert.equal(await setQuoteStatus(a.id, r.id!, "bogus"), null);
  assert.equal((await setQuoteStatus(a.id, r.id!, "replied"))?.status, "replied");
  assert.equal(await newQuoteCount(a.id), 0);
  assert.equal((await listQuotes(a.id, "replied")).length, 1);
});

test("describeSelections maps option and personalisation keys to labels", () => {
  const cfg = { tiers: [], optionGroups: [{ key: "size", label: "Box size", type: "select", choices: [{ value: "m", label: "Medium" }] }], personalisation: { artwork: "none", fields: [{ key: "name", label: "Name on box", type: "text", maxLength: 20 }] } } as never;
  assert.deepEqual(describeSelections(cfg, { size: "m", p_name: "Sara" }), [{ label: "Box size", value: "Medium" }, { label: "Name on box", value: "Sara" }]);
});
