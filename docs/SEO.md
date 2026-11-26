# SEO, AIO and LLM discovery

## Goal
Make QuickPrint (marketing site) and every shop storefront findable in Google/Bing, and citeable by AI answer engines (Google AI Overviews, ChatGPT search, Perplexity, Claude, Gemini, Apple) for the UAE (en-AE, ar-AE) and globally.

## Keyword clusters
- **Platform (B2B):** print shop software UAE · online printing store software · web-to-print platform Dubai · WhatsApp ordering for print shops · print shop QR queue · VAT invoice software UAE · Stripe print shop
- **Shops (B2C, per emirate):** online printing Dubai / Abu Dhabi / Sharjah · business cards Dubai · passport photo printing UAE · photo printing and frames · document printing and binding · flyers and brochures · confidential document printing · same-day delivery printing
- **Arabic:** طباعة اونلاين دبي · كروت شخصية · طباعة صور جواز · برنامج مطابع الإمارات

## What is implemented
| Area | Where |
|---|---|
| Site identity, `pageMetadata()` (canonical, OG, hreflang) | `src/lib/seo/site.ts`, `metadata.ts` |
| Marketing page registry → sitemap + hreflang (set `translated: true` only when `/ar/...` exists) | `src/lib/seo/paths.ts` |
| Root layout: `lang`/`dir` from middleware (`x-locale`), viewport, theme-color, Organization + WebSite JSON-LD, SoftwareApplication (AED offers from the plans table) on `/` and `/pricing` | `src/app/layout.tsx`, `middleware.ts` |
| robots.txt with explicit AI-crawler rules (`AI_CRAWLERS=allow\|search-only\|block`, default allow) | `src/app/robots.ts` |
| Platform sitemap (+ home of each indexable shop without a custom domain) | `src/app/sitemap.ts` |
| `/llms.txt` (llmstxt.org) and `/llms-full.txt` (answer-first, generated from live plans, incl. subscription vs pay-per-order and pay-as-you-go usage) | `src/lib/seo/knowledge.ts` |
| JSON-LD builders: Organization, WebSite, SoftwareApplication, FAQPage, BreadcrumbList, LocalBusiness+Store, Product/AggregateOffer (never ratings). Output escaped against `</script>` injection | `src/lib/seo/jsonld.ts`, `components/seo/JsonLd.tsx` |
| Per-shop: metadata, JSON-LD, `/sitemap.xml`, `/robots.txt`, `/llms.txt`, `/products.json`, `/og.png`. On a shop's subdomain/custom domain the same paths are served from the root | `src/app/s/[tenant]/…`, `src/lib/seo/storefront.ts` |
| Not indexed: shop `demo`, suspended, cancelled, expired trials, cart/checkout/account/orders/walk-in | `isIndexableTenant()`, `X-Robots-Tag` in `next.config.ts` |
| OG image, icons, manifest (brand palette), `/.well-known/security.txt` | `src/app/*.tsx`, `manifest.ts` |

## Configuration
- `SITE_URL` — public origin used for every canonical/sitemap URL (e.g. `https://quickprint.ae`). Must match the real host.
- `AI_CRAWLERS` — `allow` (default) | `search-only` | `block`.
- `SEO_NOINDEX_SLUGS` — extra shop slugs to keep out of search (demo is always excluded).
- `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION` — verification meta tags.
- `SECURITY_CONTACT` — e.g. `mailto:security@quickprint.ae`. `SOCIAL_LINKS` — comma-separated https profiles for `sameAs`.

## Checks
`SITE_URL=http://localhost:3122 BASE=http://localhost:3122 node web/e2e/seo-check.mjs` (against a running server; creates and removes a temporary shop). `SEO_STRICT=1` makes title/description length rules fail on every marketing page.

## Submitting
Search Console and Bing Webmaster: add the domain, submit `/sitemap.xml`. Bing/Yandex IndexNow can be added later for instant URL pings. Per-shop sitemaps are discovered through each shop's own `robots.txt`; a shop on a custom domain should be added as its own property.

## Humans still need to
1. Verify the domain in Google Search Console and Bing Webmaster; submit the sitemap.
2. Validate JSON-LD in Google's Rich Results Test and validator.schema.org (not runnable in CI here).
3. Create a Google Business Profile for each shop and link it from the storefront (`sameAs`).
4. Publish Arabic pages, then set `translated: true` in `paths.ts`; add the FAQ via `faqLd()` on the marketing page.
5. Content calendar (guides: UAE passport photo sizes, VAT invoices for print shops, WhatsApp ordering), backlinks (UAE directories, partner couriers, Nexsofture Tech), real customer reviews before adding any rating markup.
