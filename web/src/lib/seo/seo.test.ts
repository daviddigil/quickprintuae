import { test } from "node:test";
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

test("hreflang alternates only for pages whose Arabic version exists", () => {
  const before = MARKETING_PATHS.find((m) => m.path === "/pricing")!;
  assert.equal(isTranslated("/pricing"), false);
  assert.equal(pageMetadata({ title: "Pricing", description: "x".repeat(80), path: "/pricing" }).alternates?.languages, undefined);
  before.translated = true; // simulate the content agent adding /ar/pricing
  try {
    const m = pageMetadata({ title: "Pricing", description: "x".repeat(80), path: "/pricing" });
    assert.deepEqual(Object.keys(m.alternates!.languages as object).sort(), ["ar-AE", "en-AE", "x-default"]);
    assert.ok(String((m.alternates!.languages as Record<string, string>)["ar-AE"]).endsWith("/ar/pricing"));
  } finally { before.translated = false; }
  assert.equal(localizedPath("/", "ar"), "/ar");
  assert.equal(localizedPath("/pricing", "ar"), "/ar/pricing");
  assert.equal(pageMetadata({ title: "t", description: "d", path: "/x", noindex: true }).robots && (pageMetadata({ title: "t", description: "d", path: "/x", noindex: true }).robots as { index: boolean }).index, false);
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

test("who is indexable: demo, suspended, cancelled and expired trials are not", () => {
  const now = new Date("2026-12-01T00:00:00Z"), past = new Date("2026-11-01T00:00:00Z"), future = new Date("2026-12-20T00:00:00Z");
  const t = (o: object) => ({ slug: "shop", status: "active" as const, trialEndsAt: null, currentPeriodEnd: null, ...o });
  assert.equal(isIndexableTenant(t({}), now), true);
  assert.equal(isIndexableTenant(t({ slug: "demo" }), now), false);
  assert.equal(isIndexableTenant(t({ status: "suspended" }), now), false);
  assert.equal(isIndexableTenant(t({ status: "cancelled" }), now), false);
  assert.equal(isIndexableTenant(t({ status: "trial", trialEndsAt: future }), now), true);
  assert.equal(isIndexableTenant(t({ status: "trial", trialEndsAt: past }), now), false);
  assert.equal(isIndexableTenant(t({ status: "trial", trialEndsAt: past, currentPeriodEnd: future }), now), true);
});

test("canonical origin: custom domain wins, else <site>/s/<slug>; trim keeps words", () => {
  assert.equal(storefrontOrigin({ slug: "a", customDomain: "print.shop.ae" }), "https://print.shop.ae");
  assert.ok(storefrontOrigin({ slug: "a", customDomain: null }).endsWith("/s/a"));
  assert.ok(trim("word ".repeat(60), 50).length <= 50 && trim("word ".repeat(60), 50).endsWith("…"));
});
