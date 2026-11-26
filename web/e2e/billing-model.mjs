// Billing model: owner switches subscription <-> pay-per-order, sees usage; superadmin edits the rate card.
// Usage: BASE=http://localhost:3200 SA_PASSWORD=... node e2e/billing-model.mjs
import { chromium } from "playwright";
import postgres from "postgres";
import { signup } from "./helpers.mjs";
const BASE = process.env.BASE ?? "http://localhost:3200";
const SA = process.env.SA_PASSWORD ?? "change-me-now";
const sql = postgres(process.env.DATABASE_URL ?? "postgres://qp:qp@localhost:5432/quickprint");
const step = (s) => console.log("✔", s);
const assert = (c, m) => { if (!c) throw new Error("ASSERT: " + m); };
const br = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium" });
const errors = [];
const page = async () => { const p = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); p.on("pageerror", (e) => errors.push(e.message)); return p; };
const slug = "bm" + Date.now().toString(36);
try {
  const o = await page();
  await signup(o, { base: BASE, slug, name: "BM Shop" });
  await o.goto(`${BASE}/admin/billing`, { waitUntil: "networkidle" });
  assert(await o.getByTestId("billing-model").isVisible(), "billing model card");
  assert(await o.getByTestId("plan-payg").isVisible(), "pay-per-order plan offered");
  await o.getByTestId("plan-payg").getByRole("button", { name: "Switch" }).click();
  await o.waitForURL(/billing\?ok=/); await o.waitForLoadState("networkidle");
  const t = (await sql`select p.code from tenants t join plans p on p.id=t.plan_id where t.slug=${slug}`)[0];
  assert(t.code === "payg", "trial shop switched immediately, got " + t.code);
  assert(/Current plan/.test(await o.getByTestId("plan-payg").innerText()), "payg marked current");
  step("trial owner switches to pay-per-order instantly");
  // active shop: switch is scheduled
  await sql`update tenants set status='active' where slug=${slug}`;
  await o.reload({ waitUntil: "networkidle" });
  await o.getByTestId("plan-starter").getByRole("button", { name: "Switch" }).click();
  await o.waitForURL(/ok=Change(%20|\+)scheduled/); await o.waitForLoadState("networkidle");
  await o.getByTestId("pending-change").waitFor({ timeout: 15000 });
  step("active owner's switch is scheduled for next month");
  await o.getByTestId("pending-change").getByRole("button", { name: /Cancel change/ }).click();
  await o.waitForURL(/ok=Scheduled%20change%20cancelled|ok=Scheduled\+change/); await o.waitForLoadState("networkidle");
  await o.getByTestId("pending-change").waitFor({ state: "detached", timeout: 15000 });
  // usage shows up
  const tid = (await sql`select id from tenants where slug=${slug}`)[0].id;
  await sql`insert into usage_rates (kind, price_aed) values ('ai_chat_turn', 0.2) on conflict (kind) do update set price_aed=0.2`;
  for (let i = 0; i < 3; i++) await sql`insert into usage_events (tenant_id, kind, ref) values (${tid}, 'ai_chat_turn', ${"e" + i})`;
  await o.reload({ waitUntil: "networkidle" });
  const u = await o.getByTestId("usage-card").innerText();
  assert(/AI chat replies/.test(u) && /0\.60/.test(u.replace(/ /g, " ")), "usage charge 0.60 shown: " + u);
  step("owner sees pay-as-you-go usage this month");

  const sa = await page();
  await sa.goto(`${BASE}/login`); await sa.fill('input[name="email"]', "admin@quickprint.ae"); await sa.fill('input[name="password"]', SA);
  await sa.getByRole("button", { name: "Sign in" }).click(); await sa.waitForURL(/superadmin/, { timeout: 60000 });
  await sa.goto(`${BASE}/superadmin/usage`, { waitUntil: "networkidle" });
  assert(await sa.getByTestId("usage-rates").isVisible(), "rate card");
  await sa.fill('input[name="rate_ai_chat_turn"]', "0.25");
  await sa.getByRole("button", { name: "Save rates" }).click(); await sa.waitForURL(/saved=1/);
  assert((await sql`select price_aed from usage_rates where kind='ai_chat_turn'`)[0].price_aed == 0.25, "rate persisted");
  await sa.getByText("BM Shop").first().waitFor({ timeout: 15000 });
  step("superadmin edits rate card and sees usage by shop");
  await sa.goto(`${BASE}/superadmin/plans`, { waitUntil: "networkidle" });
  assert(await sa.locator('select[name="billingModel"]').count() >= 4, "plan form has billing model");
  step("plan form exposes billing model + included usage");
  assert(!errors.length, "page errors: " + errors.join("; "));
  console.log("\nALL BILLING-MODEL CHECKS PASSED");
} finally {
  await sql`delete from tenants where slug=${slug}`; await sql`update usage_rates set price_aed=0 where kind='ai_chat_turn'`;
  await br.close(); await sql.end();
}
