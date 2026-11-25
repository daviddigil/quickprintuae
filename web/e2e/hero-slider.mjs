// Hero slider + Starter walk-in e2e. Needs a running server (BASE) with the demo shop. Usage: BASE=http://localhost:3200 node e2e/hero-slider.mjs
import { chromium } from "playwright";
import postgres from "postgres";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3200";
const sql = postgres(process.env.DATABASE_URL ?? "postgres://qp:qp@localhost:5432/quickprint");
const OUT = mkdtempSync(path.join(tmpdir(), "slider-"));
const step = (s) => console.log("✔", s);
const assert = (c, m) => { if (!c) throw new Error("ASSERT: " + m); };
const demo = (await sql`select id, plan_id from tenants where slug='demo'`)[0];

const br = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium" });
const errors = [];
// real PNG files (1920x640) rendered by the browser
const mkImg = async (name, color) => {
  const p = await br.newPage({ viewport: { width: 1920, height: 640 } });
  await p.setContent(`<body style="margin:0;background:${color}"></body>`); const f = path.join(OUT, name); await p.screenshot({ path: f }); await p.close(); return f;
};
const img1 = await mkImg("offer-eid.png", "#0f766e"), img2 = await mkImg("offer-new.png", "#7c3aed"), img3 = await mkImg("offer-old.png", "#b45309");
writeFileSync(path.join(OUT, "evil.svg"), `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`);
writeFileSync(path.join(OUT, "fake.png"), "this is not an image at all");

await sql`delete from banners where tenant_id=${demo.id}`;
const owner = await (await br.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
owner.on("pageerror", (e) => errors.push(e.message));
await owner.goto(`${BASE}/login`); await owner.fill('input[name="email"]', "owner@demo.ae"); await owner.fill('input[name="password"]', "owner12345");
await owner.getByRole("button", { name: "Sign in" }).click(); await owner.waitForURL(/admin/);
await owner.goto(`${BASE}/admin/banners`, { waitUntil: "networkidle" });

const dubai = (offsetMs) => new Date(Date.now() + 4 * 3600_000 + offsetMs).toISOString().slice(0, 16);
async function addSlide(file, f) {
  await owner.setInputFiles('[data-testid="slide-file"]', file);
  for (const [k, v] of Object.entries(f)) await owner.locator(`form input[name="${k}"]`).first().fill(v);
  const before = await owner.getByTestId("banner-card").count();
  await owner.getByTestId("upload-slide").click();
  await owner.waitForFunction((n) => document.querySelectorAll('[data-testid="banner-card"]').length === n + 1, before, { timeout: 20000 });
}
await addSlide(img1, { title: "Eid Mubarak — 20% off", subtitle: "Order online, pick up today", ctaLabel: "Shop flyers", linkUrl: "/s/demo/p/flyers" });
step("uploaded slide 1 (always on, with headline, button and link)");
await addSlide(img2, { title: "New brochures", startsAt: dubai(2 * 86400_000) });
await addSlide(img3, { title: "Old summer offer", startsAt: dubai(-5 * 86400_000), endsAt: dubai(-86400_000) });
const badges = (await owner.getByTestId("banner-card").allInnerTexts()).map((t) => (/Scheduled/.test(t) ? "Scheduled" : /Expired/.test(t) ? "Expired" : /Live/.test(t) ? "Live" : "?"));
assert(JSON.stringify(badges) === JSON.stringify(["Live", "Scheduled", "Expired"]), "status badges: " + badges);
step(`admin shows status badges ${badges.join(" / ")}`);
await owner.screenshot({ path: path.join(OUT, "admin.png"), fullPage: true });

// ---- invalid uploads and links are rejected by the server ----
const post = async (file, mime, extra = {}) => owner.request.post(`${BASE}/api/v1/admin/banners/upload`, { multipart: { file: { name: path.basename(file), mimeType: mime, buffer: (await import("fs")).readFileSync(file) }, ...extra } });
assert((await post(path.join(OUT, "evil.svg"), "image/png")).status() === 415, "svg disguised as png rejected (415)");
assert((await post(path.join(OUT, "fake.png"), "image/png")).status() === 415, "text file named .png rejected (415)");
assert((await post(img1, "image/png", { linkUrl: "javascript:alert(1)" })).status() === 400, "javascript: link rejected on upload");
const first = (await sql`select id from banners where tenant_id=${demo.id} order by sort_order limit 1`)[0];
assert((await owner.request.patch(`${BASE}/api/v1/admin/banners/${first.id}`, { data: { linkUrl: "//evil.com" } })).status() === 400, "protocol-relative link rejected on edit");
assert((await owner.request.post(`${BASE}/api/v1/admin/banners/upload`, { multipart: { file: { name: "x.png", mimeType: "image/png", buffer: Buffer.alloc(5.5 * 1024 * 1024, 1) } } })).status() === 413, "5.5MB file rejected (413)");
const anon = await br.newContext(); assert((await anon.request.post(`${BASE}/api/v1/admin/banners/upload`, { multipart: { file: { name: "a.png", mimeType: "image/png", buffer: Buffer.from("x") } } })).status() === 401, "anonymous upload => 401");
step("server rejects SVG/fake images, javascript:/protocol-relative links, oversize files and anonymous uploads");

// ---- storefront: only the live slide is shown ----
const shop = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); shop.on("pageerror", (e) => errors.push(e.message));
await shop.goto(`${BASE}/s/demo`, { waitUntil: "networkidle" });
await shop.getByTestId("hero-slider").waitFor();
const count = () => shop.locator('[data-testid="hero-slider"] [role="group"]').count();
assert((await count()) === 1, "only the live slide is on the storefront (scheduled and expired are hidden); got " + (await count()));
assert((await shop.getByText("Eid Mubarak — 20% off").count()) === 1 && (await shop.getByText("Shop flyers").count()) >= 1, "headline and button show over the image");
assert((await shop.getByText("Old summer offer").count()) === 0 && (await shop.getByText("New brochures").count()) === 0, "expired/scheduled titles absent");
assert((await shop.locator("h1:not(.sr-only)").count()) === 0 && (await shop.locator("h1.sr-only").count()) === 1, "visible text hero replaced by the slider; one screen-reader/SEO h1 remains");
step("storefront shows only the live slide (scheduled + expired hidden), with headline and button");
const imgOk = await shop.locator('[data-testid="hero-slider"] img').first().evaluate((i) => i.complete && i.naturalWidth === 1920);
assert(imgOk, "uploaded image served at full size"); step("uploaded image is served correctly");

// ---- start the scheduled slide now -> two slides, autoplay, dots, reorder ----
await owner.getByTestId("edit-details").nth(1).click();
await owner.locator('form input[name="startsAt"]').last().fill(dubai(-3600_000));
await owner.getByRole("button", { name: "Save details" }).click(); await owner.waitForTimeout(1500);
await shop.reload({ waitUntil: "networkidle" });
assert((await count()) === 2, "two slides after the scheduled one starts"); assert((await shop.getByTestId("slider-dot").count()) === 2, "two dots");
const active = () => shop.locator('[data-testid="slider-dot"][data-active="true"]').evaluateAll((d) => d.length);
await shop.mouse.move(0, 0); const dotsBefore = await shop.getByTestId("slider-dot").evaluateAll((d) => d.findIndex((x) => x.dataset.active === "true"));
await shop.waitForTimeout(6500);
const dotsAfter = await shop.getByTestId("slider-dot").evaluateAll((d) => d.findIndex((x) => x.dataset.active === "true"));
assert(dotsBefore !== dotsAfter, "autoplay moved to the next slide"); step("autoplay advances (2 live slides, 2 dots)");
await shop.getByTestId("slider-dot").nth(0).click(); assert((await shop.getByTestId("slider-dot").evaluateAll((d) => d.findIndex((x) => x.dataset.active === "true"))) === 0, "dot click jumps to slide"); step("dots navigate");

await owner.getByRole("button", { name: "Move later" }).first().click(); await owner.waitForTimeout(1200);
await shop.reload({ waitUntil: "networkidle" });
const firstAlt = await shop.locator('[data-testid="hero-slider"] img').first().getAttribute("alt");
assert(/New brochures/.test(firstAlt), "reordering changes which slide comes first (got " + firstAlt + ")"); step("reorder moves the slide to the front on the storefront");

// ---- hide + delete -> falls back to the normal text hero ----
await owner.reload({ waitUntil: "networkidle" });
for (let k = await owner.getByTestId("banner-card").count(); k > 0; k--) { owner.once("dialog", (d) => d.accept()); await owner.getByRole("button", { name: "Delete" }).first().click(); await owner.waitForFunction((n) => document.querySelectorAll('[data-testid="banner-card"]').length === n - 1, k); }
await shop.reload({ waitUntil: "networkidle" });
assert((await shop.getByTestId("hero-slider").count()) === 0 && (await shop.locator("h1:not(.sr-only)").count()) === 1, "no slides -> normal text hero"); step("with no slides the storefront shows the normal headline hero");

// ---- Starter plan now includes walk-in ----
const starter = (await sql`select id from plans where code='starter'`)[0];
await sql`update tenants set plan_id=${starter.id} where id=${demo.id}`;
try {
  await owner.goto(`${BASE}/admin/walk-in`, { waitUntil: "networkidle" });
  const t = await owner.locator("body").innerText();
  assert(!/isn.t included|upgrade/i.test(t.split("Walk-in")[0] + (t.match(/upgrade[^.]*\./i)?.[0] ?? "")) || (await owner.getByTestId("walkin-queue").count()) > 0, "starter sees the queue");
  assert((await owner.getByTestId("walkin-queue").count()) === 1, "Starter-plan shop sees the live walk-in queue (no upgrade wall)");
  const walk = await shop.goto(`${BASE}/s/demo/walk-in`, { waitUntil: "networkidle" }); assert((await shop.getByText("Your name").count()) === 1, "customers can use walk-in on a Starter shop");
  step("Starter-plan shop can use the walk-in queue (admin + customer page)");
} finally { await sql`update tenants set plan_id=${demo.plan_id} where id=${demo.id}`; }

await sql`delete from banners where tenant_id=${demo.id}`; await sql.end(); await br.close();
if (errors.length) { console.log("page errors:", errors); process.exit(1); }
console.log("ALL GREEN");
