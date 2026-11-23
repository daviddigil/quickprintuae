/**
 * Integration test: real HTTP agent API + the real print-agent CLI (--fake-printer).
 *   service postgresql start
 *   NEXT_DIST_DIR=.next-agent npx next dev -p 3106 &
 *   NODE_OPTIONS=--conditions=react-server BASE=http://localhost:3106 npx tsx --tsconfig tsconfig.json e2e/agent-flow.ts
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq, and } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { db, schema } from "@/db";
import { createDb } from "@/db/client";
import { provisionTenant } from "@/server/provision";
import { putFile } from "@/server/storage";
import { createAgent } from "@/server/walk-in/agents";
import { createPrintJobs, enqueueOrderJobs } from "@/server/walk-in/queue";

const BASE = process.env.BASE ?? "http://localhost:3106";
const run = promisify(execFile);
const suffix = Date.now().toString(36);
const tenants: string[] = [];
let failed = 0;
const ok = (c: unknown, msg: string) => { if (c) console.log("✔", msg); else { failed++; console.log("✘", msg); } };

async function tenant(plan: string, n: string) {
  const { tenant: t } = await provisionTenant(createDb().db, { shopName: `Agent ${n}`, slug: `ag${n}${suffix}`, ownerName: "O", ownerEmail: `o${n}${suffix}@t.ae`, ownerPassword: "pw123456", planCode: plan });
  tenants.push(t.id); return t;
}
async function pdf(pages: number) { const d = await PDFDocument.create(); for (let i = 0; i < pages; i++) d.addPage([595, 842]); return Buffer.from(await d.save()); }

async function paidJob(tenantId: string, pages: number, name: string, opts = { color: "color", sides: "double", paperSize: "A3" } as const, copies = 2) {
  const buf = await pdf(pages);
  const key = await putFile(tenantId, buf, ".pdf", false);
  const [cust] = await db.insert(schema.walkInCustomers).values({ tenantId, phone: `+9715${Math.floor(Math.random() * 1e8)}`, name: "W" }).returning();
  const [order] = await db.insert(schema.orders).values({ tenantId, number: `AG-${Math.random().toString(36).slice(2, 8)}`, customerName: "W", customerEmail: "w@invalid", customerPhone: cust.phone, fulfillment: "pickup", subtotal: 5, vat: 0.25, total: 5.25, status: "paid", source: "walk_in", walkInCustomerId: cust.id, ticketNo: "W-001" }).returning();
  const [file] = await db.insert(schema.files).values({ tenantId, orderId: order.id, filename: name, storageKey: key, mime: "application/pdf", size: buf.length, pageCount: pages }).returning();
  const [job] = await db.transaction((tx) => createPrintJobs(tx, tenantId, order.id, "W-001", [{ fileId: file.id, filename: name, copies, pages, pagesVerified: true, options: { ...opts } }]));
  await enqueueOrderJobs(order.id);
  return { order, file, job, buf };
}
const api = (key: string | null, method: string, p: string, body?: unknown) =>
  fetch(`${BASE}/api/v1/agent${p}`, { method, headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });

async function main() {
  const t1 = await tenant("growth", "a"), t2 = await tenant("growth", "b"), tStarter = await tenant("starter", "s");
  const a1 = await createAgent(t1.id, "a1"), a2 = await createAgent(t2.id, "a2"), aS = await createAgent(tStarter.id, "s");

  // --- auth & gating
  ok((await api(null, "POST", "/claim", {})).status === 401, "no key → 401");
  ok((await api("qpa_" + "z".repeat(32), "POST", "/claim", {})).status === 401, "bad key → 401");
  ok((await api(aS.key, "POST", "/claim", {})).status === 403, "plan without walk_in_queue → 403");
  const hb = await (await api(a1.key, "POST", "/heartbeat", { printers: ["HP LaserJet", "Brother"] })).json();
  ok(hb.ok && hb.shop.name === "Agent a", "heartbeat ok, returns shop name");
  ok(JSON.stringify((await db.query.printAgents.findFirst({ where: eq(schema.printAgents.id, a1.agent.id) }))!.printers) === JSON.stringify(["HP LaserJet", "Brother"]), "heartbeat stored printers");
  ok((await (await api(a2.key, "POST", "/claim", {})).json()).job === null, "other shop's agent claims nothing");

  // --- real CLI end to end
  const w = await paidJob(t1.id, 3, "report final.pdf");
  const dl0 = await api(a1.key, "GET", `/jobs/${w.job.id}/file`);
  ok(dl0.status === 403, "download of an unclaimed (queued) job → 403");
  const fake = await mkdtemp(path.join(tmpdir(), "qp-fake-"));
  const cli = await run("node", [path.resolve("../print-agent/agent.mjs"), "--server", BASE, "--key", a1.key, "--fake-printer", fake, "--once"]).catch((e) => e);
  ok(!cli.code, "CLI --once exits 0");
  const files = await readdir(fake);
  const pdfName = files.find((f) => f.endsWith(".pdf")), jsonName = files.find((f) => f.endsWith(".json"));
  ok(!!pdfName && !!jsonName, `files landed in fake printer dir (${files.length})`);
  ok(pdfName && Buffer.compare(await readFile(path.join(fake, pdfName)), w.buf) === 0, "downloaded bytes identical to the upload");
  const meta = jsonName ? JSON.parse(await readFile(path.join(fake, jsonName), "utf8")) : {};
  ok(meta.copies === 2 && meta.options?.color === "color" && meta.options?.sides === "double" && meta.options?.paperSize === "A3", "options json carries copies/colour/sides/paper");
  ok((await db.query.printJobs.findFirst({ where: eq(schema.printJobs.id, w.job.id) }))!.status === "printed", "job → printed");
  ok((await db.query.orders.findFirst({ where: eq(schema.orders.id, w.order.id) }))!.status === "ready", "order → ready");
  ok(!!(await db.query.files.findFirst({ where: eq(schema.files.id, w.file.id) }))!.deleteAfter, "file retention timer set");
  const audits = await db.select().from(schema.auditLogs).where(and(eq(schema.auditLogs.tenantId, t1.id), eq(schema.auditLogs.action, "agent.file_download")));
  ok(audits.length === 1, "file download audited");

  // --- isolation on a claimed job
  const w2 = await paidJob(t1.id, 2, "second.pdf");
  const claim = await (await api(a1.key, "POST", "/claim", { printer: "HP" })).json();
  ok(claim.job?.id === w2.job.id && claim.job.mime === "application/pdf", "API claim returns the job");
  ok((await api(a2.key, "GET", `/jobs/${w2.job.id}/file`)).status === 404, "other shop's agent can't download → 404");
  ok((await api(a2.key, "POST", `/jobs/${w2.job.id}/complete`, { status: "printed" })).status === 404, "other shop's agent can't complete → 404");
  const a1b = await createAgent(t1.id, "a1b");
  ok((await api(a1b.key, "GET", `/jobs/${w2.job.id}/file`)).status === 403, "same shop, different agent can't download → 403");
  const dl = await api(a1.key, "GET", `/jobs/${w2.job.id}/file`);
  ok(dl.status === 200 && dl.headers.get("cache-control") === "no-store" && dl.headers.get("x-content-type-options") === "nosniff" && Buffer.compare(Buffer.from(await dl.arrayBuffer()), w2.buf) === 0, "owning agent downloads (no-store, nosniff, exact bytes)");
  ok((await api(a1.key, "POST", `/jobs/${w2.job.id}/complete`, { status: "nope" })).status === 400, "invalid complete body → 400");
  const failRes = await (await api(a1.key, "POST", `/jobs/${w2.job.id}/complete`, { status: "failed", error: "paper jam" })).json();
  ok(failRes.job.status === "queued", "failed job is retried (back to queued)");
  ok((await api(a1.key, "GET", "/nothing")).status === 404, "unknown route → 404");

  // --- rate limit
  const rl = await createAgent(t1.id, "rl");
  const codes = await Promise.all(Array.from({ length: 130 }, () => api(rl.key, "POST", "/heartbeat", { printers: [] }).then((r) => r.status)));
  ok(codes.includes(429) && codes.filter((c) => c === 200).length <= 120, `rate limit kicks in (${codes.filter((c) => c === 429).length}× 429)`);

  // --- cron
  ok((await fetch(`${BASE}/api/cron/walk-in?secret=wrong`)).status === 401, "cron rejects bad secret");
  const oldKey = await putFile(t1.id, Buffer.from("x"), ".pdf", false);
  const [orphan] = await db.insert(schema.files).values({ tenantId: t1.id, filename: "o.pdf", storageKey: oldKey, mime: "application/pdf", size: 1, createdAt: new Date(Date.now() - 7 * 3600_000) }).returning();
  const [fresh] = await db.insert(schema.files).values({ tenantId: t1.id, filename: "f.pdf", storageKey: oldKey + "f", mime: "application/pdf", size: 1 }).returning();
  await db.execute((await import("drizzle-orm")).sql`update print_jobs set status='printing', claimed_at = now() - interval '10 minutes', attempts = 1 where id = ${w2.job.id}`);
  const cron = await (await fetch(`${BASE}/api/cron/walk-in?secret=${process.env.CRON_SECRET ?? "dev-cron"}`)).json();
  ok(cron.ok && cron.orphansDeleted >= 1, `cron deleted old orphan uploads (${cron.orphansDeleted})`);
  ok(!!(await db.query.files.findFirst({ where: eq(schema.files.id, orphan.id) }))!.deletedAt, "7h-old orphan marked deleted");
  ok(!(await db.query.files.findFirst({ where: eq(schema.files.id, fresh.id) }))!.deletedAt, "fresh upload kept");
  ok((await db.query.printJobs.findFirst({ where: eq(schema.printJobs.id, w2.job.id) }))!.status === "queued", "cron recovered the stale claim");
  await rm(fake, { recursive: true, force: true });
}

main().catch((e) => { failed++; console.error(e); }).finally(async () => {
  for (const id of tenants) await db.delete(schema.tenants).where(eq(schema.tenants.id, id));
  console.log(failed ? `\n${failed} FAILED` : "\nALL GREEN");
  process.exit(failed ? 1 : 0);
});
