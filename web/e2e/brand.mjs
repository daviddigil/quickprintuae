// Brand: the real QuickPrint logo is shown (and loads) on every platform surface; icons, manifest and social images are served.
// Usage: BASE=http://localhost:3200 SA_PASSWORD=... node e2e/brand.mjs
import { chromium } from "playwright";
const BASE = process.env.BASE ?? "http://localhost:3200";
const SA = process.env.SA_PASSWORD ?? "change-me-now";
const step = (s) => console.log("✔", s);
const assert = (c, m) => { if (!c) throw new Error("ASSERT: " + m); };
const br = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium" });
const ok = async (page, label, { dark = false } = {}) => {
  await page.waitForLoadState("load"); await page.waitForTimeout(500);
  const info = await page.evaluate(() => [...document.querySelectorAll("img[src^='/brand/']")].map((i) => ({ src: i.currentSrc || i.src, w: i.naturalWidth, alt: i.alt })));
  assert(info.length > 0, `${label}: logo image present`);
  assert(info.filter((i) => i.w > 0 || true).length > 0 && info.some((i) => i.w > 0), `${label}: logo images load (${JSON.stringify(info)})`);
  assert(info.every((i) => i.alt === "QuickPrint UAE"), `${label}: alt text`);
  if (dark) assert(info.some((i) => /-dark-/.test(i.src)), `${label}: white-wordmark version on dark background`);
  return info;
};
try {
  const p = await (await br.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  for (const u of ["/", "/pricing", "/ar", "/login", "/forgot-password"]) { await p.goto(BASE + u); await ok(p, u); }
  step("logo on the marketing site (EN + AR) and the sign-in pages");
  await p.goto(BASE + "/signup"); await ok(p, "/signup", { dark: true });
  step("signup uses the white-wordmark logo on its dark panel");
  const m = await (await br.newContext({ viewport: { width: 390, height: 800 } })).newPage();
  await m.goto(BASE + "/"); await ok(m, "mobile home");
  await m.goto(BASE + "/ar"); await ok(m, "mobile /ar");
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert(!overflow, "no horizontal overflow with the logo on mobile");
  step("logo fits on a 390 px phone (EN + AR)");
  const o = await (await br.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await o.goto(BASE + "/login"); await o.fill('input[name="email"]', "owner@demo.ae"); await o.fill('input[name="password"]', "owner12345");
  await o.getByRole("button", { name: "Sign in" }).click(); await o.waitForURL(/admin/); await ok(o, "shop admin");
  step("logo in the shop admin sidebar");
  const s = await (await br.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await s.goto(BASE + "/login"); await s.fill('input[name="email"]', "admin@quickprint.ae"); await s.fill('input[name="password"]', SA);
  await s.getByRole("button", { name: "Sign in" }).click(); await s.waitForURL(/superadmin/); await ok(s, "superadmin", { dark: true });
  step("white-wordmark logo in the superadmin sidebar");
  const req = p.request;
  const sizes = { "/icon.png": [512, 512], "/apple-icon.png": [180, 180], "/opengraph-image.png": [1200, 630], "/twitter-image.png": [1200, 630], "/brand/icon-192.png": [192, 192], "/brand/icon-maskable-512.png": [512, 512] };
  for (const [u, [w, h]] of Object.entries(sizes)) {
    const r = await req.get(BASE + u); assert(r.status() === 200, `${u} -> ${r.status()}`);
    const b = await r.body(); assert(b.readUInt32BE(16) === w && b.readUInt32BE(20) === h, `${u} is ${w}x${h}`);
  }
  assert((await req.get(BASE + "/favicon.ico")).status() === 200, "favicon");
  const man = await (await req.get(BASE + "/manifest.webmanifest")).json();
  assert(man.icons.some((i) => i.purpose === "maskable") && man.icons.every((i) => i.src.startsWith("/brand/")), "manifest icons are the brand files");
  const home = await (await req.get(BASE + "/")).text();
  assert(/og:image" content="[^"]*opengraph-image\.png/.test(home), "og:image points to the static brand image");
  assert(/"logo":\{"@type":"ImageObject","url":"[^"]*\/brand\/icon-512\.png"/.test(home), "JSON-LD Organization logo");
  step("favicon, app icons, manifest, OG/Twitter images and JSON-LD logo are served at the right sizes");

  // dark mode: the marketing header/footer show the white-wordmark art, light mode the dark-wordmark art
  for (const [scheme, path] of [["dark", "/"], ["dark", "/ar"], ["light", "/"]]) {
    const pg = await (await br.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: scheme })).newPage();
    await pg.goto(BASE + path, { waitUntil: "networkidle" });
    const shown = await pg.evaluate(() => [...document.querySelectorAll("header a[title] img")].filter((i) => i.getBoundingClientRect().width > 0).map((i) => i.currentSrc || i.src));
    assert(shown.length === 1, `${scheme} ${path}: exactly one header logo visible, got ${shown.length}`);
    assert(scheme === "dark" ? shown[0].includes("-dark-") : !shown[0].includes("-dark-"), `${scheme} ${path}: wrong art ${shown[0]}`);
    if (scheme === "dark" && path === "/") await pg.locator("header").screenshot({ path: "/tmp/header-dark.png" });
  }
  const ad = await (await br.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: "dark" })).newPage();
  await ad.goto(BASE + "/login", { waitUntil: "networkidle" });
  assert((await ad.locator("main img, form img, img").evaluateAll((l) => l.filter((i) => i.getBoundingClientRect().width > 0).every((i) => !(i.currentSrc || i.src).includes("-dark-")))), "login (light page) keeps the light logo in a dark OS");
  step("dark mode shows the white wordmark on marketing pages; light pages unchanged");
  console.log("\nALL BRAND CHECKS PASSED");
} finally { await br.close(); }
