// SEO / AIO / LLM-discovery end-to-end checks against a RUNNING server.
//   SITE_URL=http://localhost:3122 APP_URL=http://localhost:3122 npx next dev -p 3122     (SITE_URL must equal how you reach it)
//   BASE=http://localhost:3122 node e2e/seo-check.mjs
// Creates a temporary shop (evil name, copies the demo catalogue) and deletes it at the end.
import http from "http";
import postgres from "postgres";

const BASE = (process.env.BASE ?? "http://localhost:3122").replace(/\/$/, "");
const SITE = (process.env.SITE_URL ?? BASE).replace(/\/$/, "");
const ROOT_DOMAIN = process.env.ROOT_DOMAIN || "localhost:3000";
const STRICT = process.env.SEO_STRICT === "1"; // strict title/description rules on every marketing page (default: only "/", others warn until adopted)
const sql = postgres(process.env.DATABASE_URL ?? "postgres://qp:qp@localhost:5432/quickprint");
const results = { ok: 0, bad: 0, warn: 0 };
const ok = (m) => { results.ok++; console.log("✔", m); };
const bad = (m, d = "") => { results.bad++; console.log("✘", m, d); };
const warn = (m, d = "") => { results.warn++; console.log("⚠", m, d); };
async function check(name, fn) { try { const r = await fn(); if (r === false) bad(name); else ok(name); } catch (e) { bad(name, "→ " + e.message); } }
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const truthy = (v, m) => { if (!v) throw new Error(m); };

const get = (url, opts = {}) => fetch(url.startsWith("http") ? url : BASE + url, { redirect: "manual", ...opts });
const text = async (url, opts) => { const r = await get(url, opts); return { r, t: await r.text() }; };
/** request with a custom Host header (shop on its own domain / subdomain) */
const hostGet = (host, path) => new Promise((resolve, reject) => {
  const u = new URL(BASE);
  const req = http.request({ host: u.hostname, port: u.port, path, method: "GET", headers: { host } }, (res) => { let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: b })); });
  req.on("error", reject); req.end();
});
const pathOf = (u) => { const x = new URL(u); return x.pathname + x.search; };
const metaOf = (h, re) => (h.match(re) ?? [])[1];
const decode = (x = "") => x.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&");
const title = (h) => decode(metaOf(h, /<title>([\s\S]*?)<\/title>/));
const desc = (h) => metaOf(h, /<meta name="description" content="([^"]*)"/);
const canonical = (h) => metaOf(h, /<link rel="canonical" href="([^"]*)"/);
const h1s = (h) => (h.match(/<h1[\s>]/g) ?? []).length;
const robotsMeta = (h) => metaOf(h, /<meta name="robots" content="([^"]*)"/);
const ldBlocks = (h) => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const ldNodes = (h) => ldBlocks(h).flatMap((b) => b["@graph"] ?? [b]);
const types = (n) => [].concat(n["@type"]);
const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));

/* ============================== platform: discovery files ============================== */
await check("robots.txt: allows public, blocks private areas, lists sitemap and AI crawlers", async () => {
  const { r, t } = await text("/robots.txt"); eq(r.status, 200, "status");
  for (const d of ["Disallow: /admin", "Disallow: /superadmin", "Disallow: /api/", "Disallow: /login", "Disallow: /s/*/checkout", "Disallow: /s/*/cart"]) truthy(t.includes(d), "missing " + d);
  truthy(t.includes(`Sitemap: ${SITE}/sitemap.xml`), "sitemap line (SITE_URL must match)");
  for (const bot of ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "anthropic-ai", "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "Bingbot", "CCBot"]) truthy(t.includes(`User-Agent: ${bot}`), "AI crawler rule missing: " + bot);
});

let sitemapUrls = [];
await check("sitemap.xml: valid, every URL returns 200 without redirect", async () => {
  const { r, t } = await text("/sitemap.xml"); eq(r.status, 200, "status"); truthy(/<urlset[^>]+sitemaps\.org/.test(t), "urlset");
  sitemapUrls = locs(t); truthy(sitemapUrls.length >= 3, "expected the marketing pages");
  for (const u of sitemapUrls) { truthy(u.startsWith(SITE), `URL not on SITE_URL: ${u}`); const x = await get(pathOf(u)); if (x.status !== 200) throw new Error(`${u} → ${x.status}`); }
  truthy(!sitemapUrls.some((u) => /\/s\/demo(\/|$)/.test(u)), "demo shop must not be listed");
});

await check("llms.txt: llmstxt.org structure (H1, blockquote summary, H2 sections, links)", async () => {
  const { r, t } = await text("/llms.txt"); eq(r.status, 200, "status"); truthy((r.headers.get("content-type") ?? "").startsWith("text/plain"), "content-type");
  truthy(/^# \S/.test(t), "H1 first"); truthy(/\n> .{40,}/.test(t), "blockquote summary"); truthy(/\n## Product/.test(t) && /\n## FAQ/.test(t), "sections");
  truthy(t.includes(`](${SITE}/pricing)`) && t.includes(`](${SITE}/llms-full.txt)`), "links are absolute"); truthy(/AED \d/.test(t), "pricing facts");
});
await check("llms-full.txt: answer-first knowledge (quick facts, AED pricing, products, FAQ)", async () => {
  const { r, t } = await text("/llms-full.txt"); eq(r.status, 200, "status"); truthy(t.length > 4000, "substantial");
  for (const s of ["## Quick facts", "## Pricing (AED", "## Features", "## Frequently asked questions", "No cash on delivery".toLowerCase() === "" ? "" : "cash on delivery", "Photo print sizes", "5% VAT", "Mamo Pay", "WhatsApp"]) truthy(!s || t.includes(s), "missing: " + s);
  truthy(/\*\*Starter\*\*: AED \d/.test(t) && /Pay per order\*\*: AED 0 per month; \d+(\.\d+)?% commission/.test(t), "plans (subscription + pay per order) rendered from the database"); truthy(/pay-as-you-go/i.test(t) && /walk-in/i.test(t), "usage billing + walk-in covered");
});
await check("manifest, OG image, icons, security.txt", async () => {
  const m = await (await get("/manifest.webmanifest")).json(); truthy(m.name && m.short_name && m.icons?.length && m.theme_color && m.start_url, "manifest fields");
  for (const p of ["/opengraph-image", "/icon", "/apple-icon"]) { const r = await get(p); eq(r.status, 200, p); eq(r.headers.get("content-type"), "image/png", p + " type"); const b = Buffer.from(await r.arrayBuffer()); truthy(b.length > 1000 && b[0] === 0x89 && b[1] === 0x50, p + " is a real PNG"); }
  const s = await (await get("/.well-known/security.txt")).text(); truthy(/^Contact: /m.test(s) && /^Expires: /m.test(s), "security.txt Contact+Expires");
});
await check("private areas send X-Robots-Tag: noindex", async () => {
  for (const p of ["/admin", "/superadmin", "/login", "/api/health", "/s/demo/cart", "/s/demo/checkout", "/s/demo/account"]) { const r = await get(p); const v = r.headers.get("x-robots-tag") ?? ""; truthy(/noindex/.test(v), `${p} → "${v}" (status ${r.status})`); }
});

/* ============================== platform: marketing pages ============================== */
for (const url of [...new Set(sitemapUrls.filter((u) => !/\/s\//.test(u)))]) {
  const path = pathOf(url).replace(/^\/ar(?=\/|$)/, "") || "/"; // English path; /ar pages are checked against their English counterpart
  await check(`marketing ${path}: canonical, one h1, title/description length, JSON-LD`, async () => {
    const { r, t: h } = await text(pathOf(url)); eq(r.status, 200, "status");
    const t = title(h) ?? "", d = desc(h) ?? "", c = canonical(h);
    truthy(c, "canonical missing"); truthy(c.replace(/\/$/, "") === url.replace(/\/$/, ""), `canonical ${c} ≠ ${url}`);
    eq(h1s(h), 1, "number of <h1>");
    const problems = [];
    if (t.length < 30 || t.length > 65) problems.push(`title ${t.length} chars (30–65): "${t}"`);
    if (d.length < 70 || d.length > 160) problems.push(`description ${d.length} chars (70–160)`);
    if (problems.length) { if (STRICT || path === "/") throw new Error(problems.join("; ")); warn(`marketing ${path}: ${problems.join("; ")} — page does not use pageMetadata() yet`); }
    const hasLang = /hrefLang|hreflang/i.test(h);
    const entry = (await (await get("/sitemap.xml")).text()).includes(`hreflang="ar-AE" href="${SITE}/ar${path === "/" ? "" : path}"`) || (await (await get("/sitemap.xml")).text()).includes(`<xhtml:link`) && (await (await get("/sitemap.xml")).text()).includes(`${SITE}/ar${path === "/" ? "" : path}`);
    if (entry) truthy(hasLang && /ar-AE/.test(h) && /x-default/.test(h), "translated page needs hreflang en-AE/ar-AE/x-default"); else truthy(!hasLang, "page without an Arabic version must not emit hreflang");
    for (const n of ldNodes(h)) truthy(n["@type"], "JSON-LD node without @type");
    if (path === "/") {
      const nodes = ldNodes(h);
      const org = nodes.find((n) => types(n).includes("Organization")), site = nodes.find((n) => types(n).includes("WebSite")), app = nodes.find((n) => types(n).includes("SoftwareApplication"));
      truthy(org?.name && org.url && org.logo?.url && org.areaServed, "Organization fields"); truthy(site?.publisher?.["@id"] === org["@id"], "WebSite.publisher → Organization");
      truthy(app?.applicationCategory === "BusinessApplication" && app.offers?.length >= 1 && app.offers.every((o) => o.priceCurrency === "AED" && o.priceSpecification?.length >= 1), "SoftwareApplication offers in AED"); truthy(app.offers.some((o) => /no per-order commission/.test(o.description)) && app.offers.some((o) => /commission on each paid order/.test(o.description)), "offers describe subscription (no commission) and pay-per-order (commission) plans");
    }
  });
}
await check("Arabic pages: lang/dir rtl, self canonical, hreflang en/ar/x-default, every sitemap alternate exists", async () => {
  const arUrls = sitemapUrls.filter((u) => /^\/ar(\/|$)/.test(pathOf(u)));
  truthy(arUrls.length >= 6, "expected /ar, /ar/pricing, /ar/signup and 3 solution pages in the sitemap");
  for (const u of arUrls) {
    const { r, t: h } = await text(pathOf(u)); eq(r.status, 200, u);
    truthy(/<html lang="ar" dir="rtl"/.test(h), `${u}: html lang/dir`); eq(canonical(h), u, `${u}: canonical`); eq(h1s(h), 1, `${u}: h1 count`);
    truthy(/hrefLang="en-AE"/i.test(h) && /hrefLang="ar-AE"/i.test(h) && /x-default/.test(h), `${u}: hreflang set`);
    for (const m of h.matchAll(/<link rel="alternate" hrefLang="[^"]+" href="([^"]+)"/gi)) { const x = await get(pathOf(m[1])); if (x.status !== 200) throw new Error(`${u}: alternate ${m[1]} → ${x.status}`); }
  }
});
await check("html lang/dir and viewport/theme-color are set", async () => { const { t: h } = await text("/"); truthy(/<html lang="en" dir="ltr"/.test(h), "html lang/dir"); truthy(/name="theme-color"/.test(h) && /name="viewport"/.test(h), "viewport/theme-color"); });

/* ============================== storefront: temp shop ============================== */
const EVIL = "</script><script>alert(1)</script> Bright & Co";
const slug = `seo${Date.now().toString(36)}`;
const demo = (await sql`select id from tenants where slug='demo'`)[0];
let tenantId;
try {
  [{ id: tenantId }] = await sql`insert into tenants (slug, name, status, emirate, address, phone, trn, settings) values (${slug}, ${EVIL}, 'active', 'Dubai', 'Al Karama', '+971500000000', '100000000000003', '{}'::jsonb) returning id`;
  await sql`insert into products (tenant_id, kind, name, slug, description, active, featured, sort_order, turnaround_hours, config)
            select ${tenantId}, kind, name, slug, description, active, featured, sort_order, turnaround_hours, config from products where tenant_id=${demo.id}`;
  const home = `/s/${slug}`; const shopUrl = `${SITE}/s/${slug}`;

  await check("shop home: canonical, one h1, unique title, PrintShop(LocalBusiness+Store) JSON-LD", async () => {
    const { r, t: h } = await text(home); eq(r.status, 200, "status");
    eq(canonical(h), shopUrl, "canonical"); eq(h1s(h), 1, "h1 count"); truthy((title(h) ?? "").includes("Dubai"), "title mentions the emirate"); truthy(!/noindex/.test(robotsMeta(h) ?? ""), "indexable");
    const shop = ldNodes(h).find((n) => types(n).includes("LocalBusiness")); truthy(shop && types(shop).includes("Store"), "LocalBusiness+Store node");
    eq(shop.name, EVIL, "shop name preserved exactly"); eq(shop.address?.addressCountry, "AE", "country"); eq(shop.address?.addressRegion, "Dubai", "region"); eq(shop.vatID, "100000000000003", "vatID from TRN");
    truthy(shop.openingHoursSpecification?.[0]?.dayOfWeek?.length >= 1, "opening hours"); truthy(/AED/.test(shop.priceRange ?? ""), "priceRange in AED"); truthy(!("aggregateRating" in shop) && !("review" in shop), "no invented ratings");
    truthy(metaOf(h, /<meta property="og:image" content="([^"]*)"/)?.endsWith(`/s/${slug}/og.png`), "shop OG image");
  });
  await check("XSS: a shop name containing </script> cannot break out of JSON-LD or the page", async () => {
    const { t: h } = await text(home); truthy(!h.includes("<script>alert(1)"), "raw injected script present in HTML");
    truthy(!/<\/script><script>alert/.test(h), "script breakout sequence present"); const n = ldNodes(h).find((x) => types(x).includes("LocalBusiness")); eq(n.name, EVIL, "JSON-LD parses back to the original text");
    for (const p of [`/s/${slug}/llms.txt`, `/s/${slug}/products.json`]) { const x = await text(p); truthy(!x.t.includes("<script>alert(1)") || x.r.headers.get("content-type").startsWith("text/plain") || x.r.headers.get("content-type").startsWith("application/json"), p); }
  });
  const prod = (await sql`select slug, name from products where tenant_id=${tenantId} and kind='business_card' limit 1`)[0] ?? (await sql`select slug, name from products where tenant_id=${tenantId} limit 1`)[0];
  await check("product page: Product + AggregateOffer (AED), BreadcrumbList, canonical, unique title", async () => {
    const { r, t: h } = await text(`/s/${slug}/p/${prod.slug}`); eq(r.status, 200, "status");
    eq(canonical(h), `${shopUrl}/p/${prod.slug}`, "canonical"); eq(h1s(h), 1, "h1"); const t = title(h) ?? ""; truthy(t.includes("Dubai") && t.endsWith(EVIL) && t.length - EVIL.length <= 60, `title "${t}"`); truthy((desc(h) ?? "").length >= 40 && (desc(h) ?? "").length <= 160, "description length");
    const nodes = ldNodes(h); const p = nodes.find((n) => types(n).includes("Product")); truthy(p, "Product node"); const o = p.offers; eq(o["@type"], "AggregateOffer", "offer type"); eq(o.priceCurrency, "AED", "currency"); truthy(typeof o.lowPrice === "number" && o.lowPrice > 0, "lowPrice number");
    truthy(nodes.some((n) => types(n).includes("BreadcrumbList")), "BreadcrumbList"); truthy(!("aggregateRating" in p) && !("review" in p), "no invented ratings");
  });
  await check("shop sitemap.xml / robots.txt / llms.txt / products.json / og.png", async () => {
    const sm = await text(`/s/${slug}/sitemap.xml`); eq(sm.r.status, 200, "sitemap"); const urls = locs(sm.t); truthy(urls.includes(shopUrl) && urls.some((u) => u.includes("/p/")), "home + product URLs");
    for (const u of urls) { const x = await get(pathOf(u)); if (x.status !== 200) throw new Error(`${u} → ${x.status}`); }
    truthy(!urls.some((u) => u.includes("walk-in")), "walk-in page must not be in the sitemap (noindex)");
    const rb = (await text(`/s/${slug}/robots.txt`)).t; truthy(rb.includes("Disallow: /cart") && rb.includes(`Sitemap: ${shopUrl}/sitemap.xml`), "shop robots");
    const ll = await text(`/s/${slug}/llms.txt`); eq(ll.r.status, 200, "llms status"); truthy(ll.t.startsWith("# ") && /From AED \d/.test(ll.t) && ll.t.includes("Dubai") && ll.t.includes("cash on delivery".replace("cash", "Cash")) , "shop llms.txt content");
    const pj = await (await get(`/s/${slug}/products.json`)).json(); truthy(pj.shop.currency === "AED" && pj.products.length > 3 && pj.products.every((p) => p.url.startsWith(shopUrl) && Array.isArray(p.options)), "products.json shape"); truthy(!JSON.stringify(pj).includes("@"), "no email addresses in the public catalogue");
    const og = await get(`/s/${slug}/og.png`); eq(og.status, 200, "og status"); eq(og.headers.get("content-type"), "image/png", "og type");
  });
  await check("shop on its own host: /sitemap.xml /robots.txt /llms.txt are served by the shop (subdomain + custom domain), canonical uses the custom domain", async () => {
    const sub = await hostGet(`${slug}.${ROOT_DOMAIN}`, "/sitemap.xml"); eq(sub.status, 200, "subdomain sitemap"); truthy(sub.body.includes(`/s/${slug}`) || sub.body.includes(slug), "subdomain sitemap is the shop's");
    const cd = `print-${slug}.example.com`; await sql`update tenants set custom_domain=${cd} where id=${tenantId}`;
    const sm = await hostGet(cd, "/sitemap.xml"); eq(sm.status, 200, "custom domain sitemap"); truthy(locs(sm.body).every((u) => u.startsWith(`https://${cd}`)), "sitemap URLs on the custom domain: " + locs(sm.body)[0]);
    const rb = await hostGet(cd, "/robots.txt"); truthy(rb.body.includes(`Sitemap: https://${cd}/sitemap.xml`), "robots sitemap on the custom domain"); const ll = await hostGet(cd, "/llms.txt"); eq(ll.status, 200, "llms"); truthy(ll.body.includes(`https://${cd}/p/`), "llms product links on the custom domain");
    const h = await hostGet(cd, "/"); eq(metaOf(h.body, /<link rel="canonical" href="([^"]*)"/), `https://${cd}`, "home canonical on the custom domain");
    await sql`update tenants set custom_domain=null where id=${tenantId}`;
  });
  await check("expired trial / suspended / demo: noindex, no sitemap, robots Disallow", async () => {
    await sql`update tenants set status='trial', trial_ends_at = now() - interval '3 days', current_period_end = null where id=${tenantId}`;
    const h = (await text(home)).t; truthy(/noindex/.test(robotsMeta(h) ?? ""), "expired trial must be noindex"); eq((await get(`/s/${slug}/sitemap.xml`)).status, 404, "sitemap 404"); truthy((await text(`/s/${slug}/robots.txt`)).t.includes("Disallow: /\n"), "robots disallow all");
    await sql`update tenants set status='active', trial_ends_at=null where id=${tenantId}`;
    const d = (await text("/s/demo")).t; truthy(/noindex/.test(robotsMeta(d) ?? ""), "demo shop is noindex"); eq((await get("/s/demo/sitemap.xml")).status, 404, "demo sitemap 404");
    truthy(!locs((await text("/sitemap.xml")).t).some((u) => u.includes("/s/demo")), "demo not in the platform sitemap");
  });
  await check("walk-in page is noindex and not canonical-listed; private pages are noindex", async () => {
    const w = await text(`/s/${slug}/walk-in`); truthy(/noindex/.test(robotsMeta(w.t) ?? "") || /noindex/.test(w.r.headers.get("x-robots-tag") ?? ""), "walk-in noindex");
    const c = await get(`/s/${slug}/cart`); truthy(/noindex/.test(c.headers.get("x-robots-tag") ?? ""), "cart X-Robots-Tag");
  });
} finally {
  if (tenantId) await sql`delete from tenants where id=${tenantId}`;
  await sql.end();
}

console.log(`\n${results.bad ? "✘" : "✔"} ${results.ok} passed, ${results.bad} failed, ${results.warn} warning(s)${STRICT ? " (strict)" : ""}`);
process.exit(results.bad ? 1 : 0);
