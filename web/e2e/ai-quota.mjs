// AI card-design allowance: per-customer monthly limit by plan, shown to the customer, explained to the owner, editable by the superadmin.
// Usage: BASE=http://localhost:3200 SA_PASSWORD=... node e2e/ai-quota.mjs
import { chromium } from "playwright";
import postgres from "postgres";
const BASE = process.env.BASE ?? "http://localhost:3200";
const SA = process.env.SA_PASSWORD ?? "change-me-now";
const sql = postgres(process.env.DATABASE_URL ?? "postgres://qp:qp@localhost:5432/quickprint");
const step = (s) => console.log("✔", s);
const assert = (c, m) => { if (!c) throw new Error("ASSERT: " + m); };
const br = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium" });
try {
  const plan = (await sql`select p.code, p.ai_designs_per_customer as n from tenants t join plans p on p.id=t.plan_id where t.slug='demo'`)[0];
  const ctx = await br.newContext();
  const r = await ctx.request.get(`${BASE}/api/v1/ai/business-card?store=demo`);
  const j = await r.json();
  assert(r.ok() && j.quota.limit === plan.n && j.quota.used === 0 && j.quota.remaining === plan.n, `quota endpoint reports ${plan.n} for the ${plan.code} plan, got ${JSON.stringify(j)}`);
  assert(/qp_vid=/.test(r.headers()["set-cookie"] ?? ""), "anonymous visitor cookie is set");
  step(`customers see their allowance (${plan.n} on the ${plan.code} plan) and get an anonymous visitor id`);
  const lim = { starter: 3, growth: 5, enterprise: 15 };
  for (const [code, n] of Object.entries(lim)) {
    const row = (await sql`select ai_designs_per_customer as n from plans where code=${code}`)[0];
    assert(row?.n === n, `${code} defaults to ${n}`);
  }
  step("Starter 3, Growth 5, Enterprise 15 designs per customer per month");
  // POST without an AI key falls back to templates and must not use up the allowance
  const p = await ctx.request.post(`${BASE}/api/v1/ai/business-card`, { data: { store: "demo", details: { name: "Test Person" } } });
  const pj = await p.json();
  assert(p.ok() && pj.quota && pj.quota.used === (pj.source === "ai" ? 1 : 0), "templates do not count, AI designs do: " + JSON.stringify({ s: pj.source, q: pj.quota }));
  step("template fallbacks are free for the customer and not counted");

  const sa = await (await br.newContext()).newPage();
  await sa.goto(`${BASE}/login`); await sa.fill('input[name="email"]', "admin@quickprint.ae"); await sa.fill('input[name="password"]', SA);
  await sa.getByRole("button", { name: "Sign in" }).click(); await sa.waitForURL(/superadmin/, { timeout: 60000 });
  await sa.goto(`${BASE}/superadmin/plans`, { waitUntil: "networkidle" });
  assert((await sa.locator('input[name="aiDesignsPerCustomer"]').count()) >= 4, "plan form has the AI designs limit");
  step("superadmin can change the limit per plan");

  const o = await (await br.newContext()).newPage();
  await o.goto(`${BASE}/login`); await o.fill('input[name="email"]', "owner@demo.ae"); await o.fill('input[name="password"]', "owner12345");
  await o.getByRole("button", { name: "Sign in" }).click(); await o.waitForURL(/admin/);
  await o.goto(`${BASE}/admin/settings`, { waitUntil: "networkidle" });
  const note = await o.getByTestId("ai-billing-note").innerText();
  assert(new RegExp(`${plan.n} AI designs a month`).test(note) && /billed to your monthly invoice/.test(note) && /whether or not the customer checks out/.test(note), "owner sees the billing note: " + note);
  step("owner is told: limit per customer, billed monthly whether or not the customer checks out");
  console.log("\nALL AI-QUOTA CHECKS PASSED");
} finally { await br.close(); await sql.end(); }
