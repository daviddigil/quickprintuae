// Live stores directory: nav link, listing by emirate/area, search, owner opt-out, Arabic page.
// Usage: BASE=http://localhost:3200 node e2e/directory.mjs   (uses 2 signups from the per-IP hourly limit)
import { chromium } from "playwright";
import postgres from "postgres";
const BASE = process.env.BASE ?? "http://localhost:3200";
const sql = postgres(process.env.DATABASE_URL ?? "postgres://qp:qp@localhost:5432/quickprint");
const step = (s) => console.log("✔", s);
const assert = (c, m) => { if (!c) throw new Error("ASSERT: " + m); };
const br = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium" });
const errors = [];
const mk = async (vp = { width: 1280, height: 860 }) => { const p = await (await br.newContext({ viewport: vp })).newPage(); p.on("pageerror", (e) => errors.push(e.message)); return p; };
const stamp = Date.now().toString(36), slugA = "da" + stamp, slugB = "db" + stamp;
async function signup(p, slug, name) {
  await p.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
  await p.getByPlaceholder("Al Noor Printing").fill(name); await p.getByPlaceholder("alnoor").fill(slug);
  await p.getByText("✓ Available").waitFor({ timeout: 15000 });
  await p.fill('input[name="ownerName"]', "Owner"); await p.fill('input[name="phone"]', "+971501112233");
  await p.fill('input[name="email"]', `${slug}@example.com`); await p.fill('input[name="password"]', "pw123456pw");
  await p.getByRole("button", { name: /create|start|sign up/i }).first().click(); await p.waitForURL(/admin/, { timeout: 60000 });
}
try {
  const a = await mk(), b = await mk();
  await signup(a, slugA, `Barsha Print ${stamp}`); await signup(b, slugB, `Majaz Copy ${stamp}`);
  await sql`update tenants set status='active', emirate='Sharjah', area='Al Majaz' where slug=${slugB}`;
  // owner A sets area + keeps listing on (this also refreshes the directory cache)
  await a.goto(`${BASE}/admin/settings`, { waitUntil: "networkidle" });
  await a.selectOption('select[name="emirate"]', "Dubai"); await a.fill('input[name="area"]', "Al Barsha");
  assert(await a.getByTestId("directory-toggle").locator("input").isChecked(), "listing is on by default");
  await a.getByRole("button", { name: /save/i }).first().click(); await a.waitForURL(/ok=/);
  const row = (await sql`select area, directory_listed from tenants where slug=${slugA}`)[0];
  assert(row.area === "Al Barsha" && row.directory_listed === true, "area saved");
  step("owner sets area and listing defaults to on");

  const c = await mk();
  await c.goto(BASE + "/", { waitUntil: "load" });
  await c.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Live stores" }).click();
  await c.waitForURL(/\/stores$/);
  step("home nav bar has 'Live stores' and opens the directory");
  const list = async () => (await c.getByTestId("stores-list").innerText().catch(() => "")) ;
  let txt = await list();
  assert(txt.includes(`Barsha Print ${stamp}`) && txt.includes(`Majaz Copy ${stamp}`), "both live shops listed");
  assert(!txt.toLowerCase().includes("demo print hub"), "demo shop not listed");
  step("both live shops are listed, demo shop is not");
  await c.goto(`${BASE}/stores?emirate=Dubai`, { waitUntil: "load" }); txt = await list();
  assert(txt.includes("Barsha Print") && !txt.includes("Majaz Copy"), "emirate filter");
  await c.goto(`${BASE}/stores?emirate=Sharjah&area=Al%20Majaz`, { waitUntil: "load" }); txt = await list();
  assert(txt.includes("Majaz Copy") && !txt.includes("Barsha Print"), "area filter");
  await c.goto(`${BASE}/stores?q=barsha`, { waitUntil: "load" }); txt = await list();
  assert(txt.includes("Barsha Print") && !txt.includes("Majaz Copy"), "search");
  await c.goto(`${BASE}/stores?emirate=Ajman`, { waitUntil: "load" });
  assert(await c.getByTestId("stores-empty").isVisible(), "empty state");
  step("emirate, area and search filters work; empty state shows");

  const m = await mk({ width: 390, height: 844 });
  await m.goto(BASE + "/", { waitUntil: "load" });
  await m.getByRole("button", { name: /open menu/i }).click();
  assert(await m.getByRole("navigation", { name: "Mobile" }).getByRole("link", { name: "Live stores" }).isVisible(), "mobile menu link");
  await m.goto(`${BASE}/stores`, { waitUntil: "load" });
  assert(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "no horizontal overflow on mobile");
  step("mobile menu link works and page does not overflow");

  const ar = await mk(); await ar.goto(`${BASE}/ar/stores`, { waitUntil: "load" });
  assert((await ar.getAttribute("html", "dir")) === "rtl", "arabic rtl");
  assert(await ar.getByRole("heading", { level: 1 }).innerText() !== "", "arabic h1");
  step("Arabic page renders RTL");

  // owner B opts out -> disappears right away (cache tag revalidated)
  await b.goto(`${BASE}/admin/settings`, { waitUntil: "networkidle" });
  await b.getByTestId("directory-toggle").locator("input").uncheck();
  await b.getByRole("button", { name: /save/i }).first().click(); await b.waitForURL(/ok=/);
  await c.goto(`${BASE}/stores`, { waitUntil: "load" }); txt = await list();
  assert(txt.includes("Barsha Print") && !txt.includes("Majaz Copy"), "opted-out shop disappears");
  step("owner opt-out removes the shop from the directory immediately");
  assert(!errors.length, "page errors: " + errors.join("; "));
  console.log("\nALL DIRECTORY CHECKS PASSED");
} finally {
  await sql`delete from tenants where slug in (${slugA}, ${slugB})`; await sql.end(); await br.close();
}
