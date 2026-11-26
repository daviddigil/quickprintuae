// k6 load test: storefront, product page, checkout start (fake payments).
//   k6 run -e BASE=https://staging.example.com -e SHOP=demo -e PRODUCT_SLUG=flyers -e PRODUCT_ID=<uuid> loadtest/storefront.js
//   k6 run -e VUS=100 -e DURATION=10m ...     (defaults: 50 VUs, 5m, ramped)
// RUN ONLY AGAINST STAGING (or local) started with PAYMENTS_FAKE=1: the checkout step creates real order rows.
//   PRODUCT_ID: any active product id of the shop (psql: select id, slug from products where tenant_id=(select id from tenants where slug='demo') limit 1).
//   Without PRODUCT_ID the checkout scenario is skipped (browse-only test).
// Thresholds mirror docs/GO_LIVE.md: p95 < 800 ms for pages, < 1500 ms for checkout start, < 1% errors.
import http from "k6/http";
import { check, group, sleep } from "k6";

const BASE = (__ENV.BASE || "http://localhost:3000").replace(/\/$/, "");
const SHOP = __ENV.SHOP || "demo";
const PRODUCT_SLUG = __ENV.PRODUCT_SLUG || "";
const PRODUCT_ID = __ENV.PRODUCT_ID || "";
const VUS = Number(__ENV.VUS || 50);

export const options = {
  stages: [
    { duration: "1m", target: VUS },
    { duration: __ENV.DURATION || "3m", target: VUS },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{kind:page}": ["p(95)<800"],
    "http_req_duration{kind:checkout}": ["p(95)<1500"],
  },
};

const slot = () => { const d = new Date(Date.now() + 3 * 86400000); d.setUTCHours(8, 0, 0, 0); return d.toISOString(); };

export default function () {
  group("browse", () => {
    const home = http.get(`${BASE}/s/${SHOP}`, { tags: { kind: "page" } });
    check(home, { "storefront 200": (r) => r.status === 200 });
    sleep(1 + Math.random() * 2);
    if (PRODUCT_SLUG) {
      const p = http.get(`${BASE}/s/${SHOP}/p/${PRODUCT_SLUG}`, { tags: { kind: "page" } });
      check(p, { "product 200": (r) => r.status === 200 });
      sleep(1 + Math.random() * 2);
    }
    const cart = http.get(`${BASE}/s/${SHOP}/cart`, { tags: { kind: "page" } });
    check(cart, { "cart 200": (r) => r.status === 200 });
  });

  // ~20% of virtual users start a checkout
  if (PRODUCT_ID && Math.random() < 0.2) {
    group("checkout start (fake payments)", () => {
      const n = `${__VU}-${__ITER}`;
      const body = {
        contact: { name: `Load Test ${n}`, email: `load-${n}@example.com`, phone: "+971500000000" },
        lines: [{ productId: PRODUCT_ID, quantity: 100, pages: 1, selections: {}, fileIds: [] }],
        fulfillment: "delivery",
        address: { line1: "Load test street 1", area: "Al Barsha", city: "Dubai", emirate: "Dubai" },
        slotStart: slot(),
        provider: "stripe",
      };
      const r = http.post(`${BASE}/api/v1/store/${SHOP}/checkout`, JSON.stringify(body), { headers: { "content-type": "application/json" }, tags: { kind: "checkout" } });
      check(r, { "checkout answered": (x) => x.status === 200 || x.status === 400 || x.status === 502 }); // 400/502 = validation or gateway not in fake mode: still measured
      if (r.status !== 200) console.warn(`checkout ${r.status}: ${String(r.body).slice(0, 160)}`);
    });
  }
  sleep(1 + Math.random() * 2);
}
