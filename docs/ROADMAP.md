# Product Roadmap

_QuickPrint UAE — Powered by Nexsofture Tech_

## v1.0: MVP (this repository)
- Multi-tenant SaaS: marketing site, self-serve signup with a 14-day trial, subdomain + custom-domain storefronts
- Catalog pre-loaded with UAE defaults: documents (A5–A0), confidential printing, global photo sizes, passport/visa photo presets, framed prints, business cards, flyers, brochures, notebooks, posters
- Server-side pricing engine (tiers, per-page, option multipliers, setup fees, 5% VAT)
- AI business card designer (Claude) + drag-and-drop editor
- Prepaid checkout only: Stripe and Mamo Pay into each shop's own account
- Pickup branches and scheduled delivery slots, with in-house drivers + courier adapters (Jeebly, Quiqup, Careem Box, Aramex)
- Store admin: orders board, production status, products and pricing, delivery zones, team, settings
- Super admin: shops, plans, SaaS invoices + dunning, impersonation with audit log, platform health
- Docker, CI, in-region deployment guide

## v1.1: Months 2–3 (pilot feedback)
- **Arabic + RTL storefront** and bilingual tax invoices
- WhatsApp: order status notifications (WhatsApp Business API), "share to WhatsApp" pay links
- Email/SMS notifications (order confirmation, ready for pickup, out for delivery)
- PDF tax invoice download with TRN, plus a VAT report export for FTA filing
- Discount codes and first-order promos
- Automated passport photo compliance check (face detection, background, head ratio)

## v1.5: Months 4–6 (revenue expansion)
- **B2B corporate accounts:** company profiles, multiple buyers, approval flow, credit terms, monthly statements
- **WhatsApp AI chat cart (LIVE; real numbers need a Meta app + review):** WhatsApp Business coexistence, AI quotes, conversational cart and checkout links, human takeover. See `docs/WHATSAPP.md`.
- Multi-branch management: per-branch inventory of services, routing orders to the nearest branch
- Re-order in one click, saved designs, brand kits for companies
- Print-ready preflight (DPI check, bleed, CMYK warning) for uploads
- Tabby/Tamara BNPL for large orders (where providers allow it)
- Driver mobile view for in-house delivery (route, proof of delivery photo, signature for confidential docs)

## v2.0: Months 7–12 (network effects)
- **Customer mobile apps** (iOS/Android) on the existing `/api/v1`
- **QuickPrint marketplace:** customers order from a central app, and jobs route to the nearest capable shop with SLA scoring and a platform commission
- Overflow / white-label production between shops (a small shop sells large-format and outsources it to a partner shop)
- Template marketplace for flyers and cards (designers earn per use)
- Accounting integrations (Zoho Books, QuickBooks, Xero) and e-invoicing via an accredited provider
- Open API + webhooks for Enterprise customers
- Expansion: KSA, Oman, Qatar (multi-currency, local VAT rates, local gateways)

## Platform / engineering backlog
- S3/R2 storage adapter and malware scanning on upload
- Redis-backed rate limiting and a job queue (emails, courier sync, file purge)
- Row-level security policies in Postgres as defence-in-depth for tenancy
- Observability: OpenTelemetry traces, error tracking, uptime checks
- Load test checkout and upload paths. Add a CDN for storefront assets.

## Shipped: Walk-in QR print queue
Walk-in customers upload + pay by QR; paid jobs print via a print agent in priority order. Next: SMS/WhatsApp OTP for the phone number, server-side Word/PowerPoint→PDF conversion (accurate page counts), multi-printer routing (A3 / colour), kiosk tablet mode, loyalty for repeat walk-ins.
