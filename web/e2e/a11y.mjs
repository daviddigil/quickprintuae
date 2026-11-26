// Accessibility sweep with axe-core (WCAG 2.1 A/AA) over public, shop-admin and superadmin pages at desktop + mobile.
// Usage: BASE=http://localhost:3200 SA_PASSWORD=... node e2e/a11y.mjs   (exits 1 on serious/critical violations)
import { chromium } from "playwright";
import postgres from "postgres";
import { readFileSync } from "fs";
import { createRequire } from "module";
import { signup } from "./helpers.mjs";
const BASE = process.env.BASE ?? "http://localhost:3200";
const SA = process.env.SA_PASSWORD ?? "change-me-now";
const sql = postgres(process.env.DATABASE_URL ?? "postgres://qp:qp@localhost:5432/quickprint");
const axeSrc = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const br = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium" });
const results = [];
async function scan(page, url, label) {
  await page.goto(BASE + url, { waitUntil: "load", timeout: 45000 }); await page.waitForTimeout(900);
  await page.evaluate(axeSrc);
  const r = await page.evaluate(() => axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }));
  for (const v of r.violations) results.push({ label, url, id: v.id === "color-contrast" ? "color-contrast@" + url : v.id, impact: v.impact, n: v.nodes.length, help: v.help, sample: v.nodes[0]?.target?.join(" ").slice(0, 90), html: v.nodes.slice(0,4).map((n) => n.html.slice(0, 120) + (v.id === 'color-contrast' ? ' ' + (n.any[0]?.message ?? '').slice(0, 110) : '')).join(" || ") });
}
const slug = "ax" + Date.now().toString(36);
try {
  for (const [vp, name] of [[{ width: 1280, height: 860 }, "desktop"], [{ width: 390, height: 844 }, "mobile"]]) {
    const pub = await (await br.newContext({ viewport: vp })).newPage();
    for (const u of ["/", "/pricing", "/signup", "/login", "/s/demo", "/s/demo/p/business-cards", "/s/demo/cart", "/s/demo/walk-in"]) await scan(pub, u, name);
    const o = await (await br.newContext({ viewport: vp })).newPage();
    await signup(o, { base: BASE, slug: slug + name[0], name: "A11y Shop " + name });
    for (const u of ["/admin", "/admin/orders", "/admin/products", "/admin/billing", "/admin/verification", "/admin/settings", "/admin/whatsapp", "/admin/walk-in"]) await scan(o, u, name + ":admin");
    const s = await (await br.newContext({ viewport: vp })).newPage();
    await s.goto(BASE + "/login"); await s.fill('input[name="email"]', "admin@quickprint.ae"); await s.fill('input[name="password"]', SA);
    await s.getByRole("button", { name: "Sign in" }).click(); await s.waitForURL(/superadmin/, { timeout: 60000 });
    for (const u of ["/superadmin", "/superadmin/plans", "/superadmin/usage", "/superadmin/commissions", "/superadmin/tenants", "/superadmin/verifications"]) await scan(s, u, name + ":super");
  }
} finally { await sql`delete from tenants where slug like ${slug + "%"}`; await sql.end(); await br.close(); }
const byRule = new Map();
for (const r of results) { const k = `${r.impact}|${r.id}`; const e = byRule.get(k) ?? { ...r, pages: new Set() }; e.pages.add(r.label + r.url); byRule.set(k, e); }
const rows = [...byRule.values()].sort((a, b) => ["critical", "serious", "moderate", "minor"].indexOf(a.impact) - ["critical", "serious", "moderate", "minor"].indexOf(b.impact));
for (const e of rows) { console.log(`${e.impact.padEnd(9)} ${e.id.padEnd(28)} pages:${e.pages.size} e.g. ${e.sample}  — ${e.help}`); if (process.env.VERBOSE) { console.log("    ", [...e.pages].slice(0, 6).join(", ")); console.log("    HTML:", e.html); } }
const bad = rows.filter((e) => ["critical", "serious"].includes(e.impact));
console.log(bad.length ? `\n✘ ${bad.length} serious/critical rule(s) violated` : "\n✔ no serious/critical axe violations");
process.exit(bad.length ? 1 : 0);
