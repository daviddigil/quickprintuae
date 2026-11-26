import { test } from "node:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { en } from "@/lib/i18n/en";
import { ar } from "@/lib/i18n/ar";
import { getCopy } from "@/lib/i18n";
import { SOLUTION_SLUGS, isSolutionSlug } from "@/lib/i18n";
import assert from "node:assert/strict";
import { jsonLdString, printShopLd, productLd, faqLd, breadcrumbLd, softwareApplicationLd } from "./jsonld";
import { pageMetadata, localizedPath } from "./metadata";
import { MARKETING_PATHS, isTranslated } from "./paths";
import { isIndexableTenant, storefrontOrigin, trim } from "./storefront";

test("JSON-LD cannot break out of its <script> tag", () => {
  const evil = `</script><script>alert(1)</script> &  `;
  const s = jsonLdString({ name: evil });
  assert.ok(!s.includes("<") && !s.includes(">") && !s.includes("&") && !s.includes(" "), s);
  assert.equal(JSON.parse(s).name, evil, "round-trips exactly");
});

const appDir = join(process.cwd(), "src/app");
/** Does the Next.js route for this URL path exist (static page.tsx, or a [slug] route that serves it)? */
function routeExists(urlPath: string): boolean {
  const parts = urlPath.split("/").filter(Boolean);
  let dir = appDir;
  for (const part of parts) {
    if (existsSync(join(dir, part))) { dir = join(dir, part); continue; }
    const dyn = existsSync(dir) && readdirSync(dir).find((d) => /^\[[^\]]+\]$/.test(d));
    if (!dyn) return false;
    dir = join(dir, dyn);
  }
  return existsSync(join(dir, "page.tsx"));
}

test("every marketing path has an English page, and translated:true means the /ar page really exists", () => {
  for (const m of MARKETING_PATHS) {
    assert.ok(routeExists(m.path), `missing English page for ${m.path}`);
    assert.equal(routeExists(localizedPath(m.path, "ar")), m.translated, `${m.path}: translated flag (${m.translated}) disagrees with the /ar page on disk`);
  }
  // the three solution pages are registered in both languages
  for (const s of SOLUTION_SLUGS) assert.ok(isTranslated(`/solutions/${s}`), s);
});

test("hreflang alternates only for pages whose Arabic version exists", () => {
  const m = pageMetadata({ title: "Pricing", description: "x".repeat(80), path: "/pricing" });
  assert.deepEqual(Object.keys(m.alternates!.languages as object).sort(), ["ar-AE", "en-AE", "x-default"]);
  const langs = m.alternates!.languages as Record<string, string>;
  assert.ok(langs["ar-AE"].endsWith("/ar/pricing") && langs["en-AE"].endsWith("/pricing") && !langs["en-AE"].includes("/ar/"));
  assert.ok(String(m.alternates!.canonical).endsWith("/pricing"));
  const ar = pageMetadata({ title: "t", description: "d".repeat(80), path: "/pricing", locale: "ar" });
  assert.ok(String(ar.alternates!.canonical).endsWith("/ar/pricing"));
  assert.equal((ar.openGraph as { locale: string }).locale, "ar_AE");
  // an unregistered / untranslated path emits no alternates
  assert.equal(pageMetadata({ title: "x", description: "d".repeat(80), path: "/nope" }).alternates?.languages, undefined);
  // simulate a page whose Arabic version does not exist yet
  const entry = MARKETING_PATHS.find((x) => x.path === "/signup")!;
  entry.translated = false;
  try { assert.equal(pageMetadata({ title: "x", description: "d".repeat(80), path: "/signup" }).alternates?.languages, undefined); } finally { entry.translated = true; }
  assert.equal(localizedPath("/", "ar"), "/ar");
  assert.equal(localizedPath("/pricing", "ar"), "/ar/pricing");
  assert.equal(pageMetadata({ title: "t", description: "d", path: "/x", noindex: true }).robots && (pageMetadata({ title: "t", description: "d", path: "/x", noindex: true }).robots as { index: boolean }).index, false);
});

test("Arabic and English dictionaries: same shape, meta lengths, billing figures unchanged", () => {
  const shape = (o: unknown): unknown => (Array.isArray(o) ? o.map(shape) : o && typeof o === "object" ? Object.fromEntries(Object.entries(o).filter(([k]) => !["planNames", "features", "kinds", "emirates"].includes(k)).map(([k, v]) => [k, shape(v)])) : typeof o === "number" ? "n" : typeof o === "string" ? "s" : o);
  const ks = (o: unknown, pre = ""): string[] => (o && typeof o === "object" ? Object.entries(o).flatMap(([k, v]) => ks(v, `${pre}.${k}`)) : [pre]);
  // identical key paths (array lengths included)
  assert.deepEqual(ks(shape(ar)).sort(), ks(shape(en)).sort());
  const E = getCopy("en", 7), A = getCopy("ar", 7); // tokens filled
  const metas = [E.home.meta, A.home.meta, E.pricingPage.meta, A.pricingPage.meta, E.signup.meta, A.signup.meta, ...SOLUTION_SLUGS.flatMap((s) => [E.solutions.pages[s].meta, A.solutions.pages[s].meta])];
  for (const m of metas) assert.ok(m.description.length >= 70 && m.description.length <= 160, `description ${m.description.length}: ${m.description}`);
  for (const m of [A.pricingPage.meta, A.signup.meta, ...SOLUTION_SLUGS.map((s) => A.solutions.pages[s].meta)]) assert.ok(m.title.length + " | QuickPrint".length <= 65 && m.title.length >= 17, m.title);
  // billing figures stay exactly as in English
  const figures = (c: typeof en) => JSON.stringify([c.home.faq, c.pricingPage.faq, c.billing, c.home.pricing, c.priceTable.paygLine, c.signup.form]).match(/\b\d[\d,.]*%?/g)!.map((x) => x.replace(/[,.]$/, "")).sort();
  assert.deepEqual(figures(A), figures(E));
  assert.match(JSON.stringify(ar.billing), /AED 499/); assert.match(JSON.stringify(ar.billing.payg), /\{pct\}%/);
  // Arabic copy never uses Arabic-Indic digits (numbers stay as is)
  assert.ok(!/[\u0660-\u0669]/.test(JSON.stringify(ar)));
  // every solution page references valid FAQ indices and related pages
  for (const s of SOLUTION_SLUGS) for (const c of [en, ar]) { const p = c.solutions.pages[s]; assert.ok(p.faq.every((i) => c.home.faq[i])); assert.ok(p.related.every((r) => isSolutionSlug(r) && r !== s)); }
});

test("print shop + product structured data (no ratings, AED offer, opening hours)", () => {
  const shop = printShopLd({ id: "https://x/s/a#shop", url: "https://x/s/a", name: "A", emirate: "Dubai", address: "Karama", openHour: 9, closeHour: 21, closedWeekdays: [5], areaServed: ["Dubai", "Sharjah"], vatId: "100000000000003" });
  assert.deepEqual(shop["@type"], ["LocalBusiness", "Store"]);
  const spec = (shop.openingHoursSpecification as { dayOfWeek: string[]; opens: string; closes: string }[])[0];
  assert.ok(!spec.dayOfWeek.includes("Friday") && spec.dayOfWeek.length === 6 && spec.opens === "09:00" && spec.closes === "21:00");
  assert.equal((shop.address as { addressCountry: string }).addressCountry, "AE");
  const p = productLd({ url: "https://x/p", name: "Flyers", description: "d", shopId: "https://x/s/a#shop", shopName: "A", lowPrice: 60, vatIncluded: false });
  const offer = p.offers as { "@type": string; lowPrice: number; priceCurrency: string };
  assert.equal(offer["@type"], "AggregateOffer"); assert.equal(offer.priceCurrency, "AED"); assert.equal(offer.lowPrice, 60);
  assert.ok(!("aggregateRating" in p) && !("review" in p));
  assert.equal(productLd({ url: "u", name: "n", description: "d", shopId: "i", shopName: "s", lowPrice: null, vatIncluded: false }).offers, undefined);
});

test("software application offers come from the plans", () => {
  const ld = softwareApplicationLd([{ code: "s", name: "Starter", priceMonthly: 199, priceYearly: 1990, orderFeePct: 2, maxOrdersPerMonth: 300, maxStaff: 2, features: ["A", "B"] }]);
  const offer = (ld.offers as { price: number; priceCurrency: string; priceSpecification: { unitCode: string }[] }[])[0];
  assert.equal(offer.price, 199); assert.equal(offer.priceCurrency, "AED"); assert.deepEqual(offer.priceSpecification.map((x) => x.unitCode), ["MON", "ANN"]);
  assert.equal((faqLd([{ q: "Q?", a: "A." }]).mainEntity as unknown[]).length, 1);
  assert.equal((breadcrumbLd([{ name: "a", url: "u" }]).itemListElement as { position: number }[])[0].position, 1);
});

test("commission plan: AED 0 subscription, commission in the terms; subscription plan: no commission", () => {
  const sub = { code: "s", name: "Starter", priceMonthly: 199, priceYearly: 1990, orderFeePct: 0, maxOrdersPerMonth: null, maxStaff: 2, features: [], billingModel: "subscription" };
  const payg = { code: "p", name: "Pay per order", priceMonthly: 0, priceYearly: 0, orderFeePct: 3, maxOrdersPerMonth: null, maxStaff: 1, features: [], billingModel: "commission" };
  const offers = softwareApplicationLd([sub, payg]).offers as { price: number; description: string; priceSpecification: unknown[] }[];
  assert.match(offers[0].description, /no per-order commission/); assert.equal(offers[0].priceSpecification.length, 2);
  assert.equal(offers[1].price, 0); assert.match(offers[1].description, /3% commission on each paid order/); assert.equal(offers[1].priceSpecification.length, 1);
  assert.match(offers[1].description, /pay-as-you-go/);
});

test("who is indexable: demo, suspended, cancelled and expired trials are not", () => {
  const now = new Date("2026-12-01T00:00:00Z"), past = new Date("2026-11-01T00:00:00Z"), future = new Date("2026-12-20T00:00:00Z");
  const t = (o: object) => ({ slug: "shop", status: "active" as const, trialEndsAt: null, currentPeriodEnd: null, verificationStatus: "verified", ...o });
  assert.equal(isIndexableTenant(t({}), now), true);
  assert.equal(isIndexableTenant(t({ slug: "demo" }), now), false);
  assert.equal(isIndexableTenant(t({ status: "suspended" }), now), false);
  assert.equal(isIndexableTenant(t({ status: "cancelled" }), now), false);
  assert.equal(isIndexableTenant(t({ status: "trial", trialEndsAt: future }), now), true);
  assert.equal(isIndexableTenant(t({ status: "trial", trialEndsAt: past }), now), false);
  assert.equal(isIndexableTenant(t({ status: "trial", trialEndsAt: past, currentPeriodEnd: future }), now), true);
  for (const v of ["unverified", "pending_review", "rejected", "expired"]) assert.equal(isIndexableTenant(t({ verificationStatus: v }), now), false, `${v} is not indexable`);
  assert.equal(isIndexableTenant(t({ status: "incomplete" }), now), false);
});

test("canonical origin: custom domain wins, else <site>/s/<slug>; trim keeps words", () => {
  assert.equal(storefrontOrigin({ slug: "a", customDomain: "print.shop.ae" }), "https://print.shop.ae");
  assert.ok(storefrontOrigin({ slug: "a", customDomain: null }).endsWith("/s/a"));
  assert.ok(trim("word ".repeat(60), 50).length <= 50 && trim("word ".repeat(60), 50).endsWith("…"));
});
