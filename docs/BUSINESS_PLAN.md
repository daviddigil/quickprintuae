# QuickPrint UAE: Business Plan (v1, Nov 2026)

_Powered by Nexsofture Tech_

> Written from the co-founder / CFO / analyst seat. **Every market figure here is an estimate or assumption, not verified data.** Replace each one with real numbers from customer interviews and the first pilots before showing this to investors.

## 1. One-line pitch

QuickPrint gives every small UAE print shop a branded online store. Customers upload files, get an exact price, pay upfront (card, Apple Pay, Mamo Pay) and choose pickup or a delivery slot. The shop pays a monthly subscription plus a small fee per order.

## 2. The problem

**Print shop owners** (Karama, Bur Dubai, Deira, Al Nahda, Sharjah's Rolla/Al Qasimia, Abu Dhabi's Hamdan St, Musaffah):
- Most orders arrive by walk-in or WhatsApp. Staff quote by hand, chase files over WhatsApp, and lose orders after hours.
- Cash on delivery and "pay when you collect" lead to uncollected jobs and wasted stock.
- No simple way to offer delivery. Each courier relationship is manual.
- Pricing is in the owner's head, so quotes vary from staff member to staff member.

**Customers** (residents, SMEs, students, typing-centre clients):
- Need prints fast: visa and passport photos, attested-document copies, CVs, business cards for a new trade licence.
- Don't want to queue or park in Karama for 10 pages. They want to upload, pay, and have it delivered or ready for pickup.

## 3. Market and demand drivers (qualitative; quantify in discovery)

| Demand driver | Why it matters in the UAE | Product |
|---|---|---|
| Visa / residency / passport / Emirates ID photos | Constant expat churn and renewals. Strict size and background specs per country. | Passport photo presets |
| Government and PRO documents | Typing centres, attestation, tenancy (Ejari), labour docs | Document + confidential printing |
| New SMEs (free-zone and mainland licences) | Every new licence needs cards, flyers and a company profile | Business cards (AI), flyers, brochures |
| Events, exhibitions, real estate | Large events calendar and property marketing | Posters, roll-ups, flyers |
| Students and universities | Theses, projects, binding | Document printing + binding |
| Gifting and memories | Photos, frames, notebooks for corporate gifting (Ramadan, National Day) | Photo prints, frames, notebooks |

Sizing approach (to be validated):
- Number of print and typing shops: get counts from DED / Dubai Economy trade-licence activity searches for "printing" and "typing" activities in each emirate.
- Estimate addressable shops = licensed print shops with 2–20 staff that already use WhatsApp for orders.
- **Working assumption for planning only:** a few thousand print/typing outlets nationally. A realistic target is 1–3% in year one (≈ 50–100 paying shops).

## 4. Competition (categories, no unverified claims)

| Category | Examples (verify current offering) | Our angle |
|---|---|---|
| Large UAE online printers with their own presses | Established Dubai online-print brands | We don't compete for their customers. We arm the many small shops they compete against. |
| Global web-to-print platforms | International online print brands that ship to the UAE | Slower delivery to the UAE, no local pickup, foreign pricing |
| Web-to-print software (B2B) | International W2P / print-MIS vendors | Usually expensive, built for Western markets, no Mamo Pay or local couriers, long setups |
| Generic e-commerce builders | Shopify, Zid, Salla, WooCommerce | Can't price by page, paper size or tier, and have no file workflow or slot scheduling. The shop has to build everything. |
| Status quo | WhatsApp + cash | Our real competitor. We must be easier than WhatsApp. |

## 5. Positioning: what we are and aren't

**We are a vertical SaaS for small and mid-sized UAE print shops.** The marketplace comes later. Reasons:
1. A marketplace needs liquidity on both sides plus quality control on someone else's presses. That means high capital needs and slow growth.
2. SaaS earns revenue from shop #1. Shops bring their existing customers, so our customer-acquisition cost is low.
3. Once 100+ shops run on QuickPrint, a **network/marketplace layer** ("find the nearest shop that can print this in 1 hour") becomes possible on top. That is the v2 moat.

**Large chains** (the "Desco-scale" ask): an Enterprise plan exists, but treat big brands as phase 2. Win 20–30 small shops first for testimonials, then pitch multi-branch chains with proof.

## 6. Pricing (implemented in the product)

| Plan | AED / month | Yearly | Order fee | Limits |
|---|---|---|---|---|
| Starter | 199 | 1,990 | 2% | 300 orders/mo, 2 staff, walk-in QR print queue, hero slider |
| Growth | 499 | 4,990 | 1% | 2,000 orders/mo, 10 staff, AI designer, couriers, custom domain |
| Enterprise | 1,499 | 14,990 | 0.5% | Unlimited, multi-branch, API |

All prices exclude 5% VAT. There is a 14-day trial with no card required.

Rationale:
- Anchor the price below one part-time staff salary. The tool replaces hours of quoting and WhatsApp file chasing.
- The order fee keeps the entry price low and lets us share in the upside. It is capped by the declining percentage on higher tiers.
- Payment processing is paid by the shop directly to Stripe or Mamo Pay (their own merchant account). That avoids becoming a payment facilitator, which brings CBUAE licensing questions.

## 7. Unit economics

### Example shop (assumption)
- 400 online orders/month × AED 45 average order value = **AED 18,000 GMV/month**
- Payment fees (shop pays its provider): about 2.5–3% + fixed fee per transaction ≈ **AED 600–900** (verify current Stripe UAE and Mamo Pay pricing)
- QuickPrint on Growth: AED 499 + 1% × 18,000 = **AED 679 / month** (≈ 3.8% of online GMV)
- Value to the shop: about 2 staff-hours a day saved on quoting and file handling, no unpaid jobs, after-hours orders and delivery revenue. It should pay back if it adds roughly 15 orders a month or saves about 30 staff hours.

### Our side per shop (blended)
| Item | AED / month |
|---|---|
| Subscription (mix: 50% Starter / 40% Growth / 10% Enterprise) | 449 |
| Order fees (avg GMV 12,000 × ~1.45%) | 174 |
| **Revenue / shop** | **623** |
| Platform Stripe fees on our invoice (~3%) | -19 |
| Infra + AI usage (marginal) | -5 |
| **Contribution / shop** | **≈ 600 (96%)** |

- CAC target: ≤ AED 1,500 per shop, mostly through field sales in print clusters. Payback is about 2.5 months.
- Churn assumption: 3% monthly. LTV ≈ 600 / 0.03 = AED 20,000. LTV/CAC ≈ 13.

## 8. 12-month P&L projection (illustrative)

Assumptions: paying shops ramp from 0 to 78 (net of churn). ARPA AED 623. Team: 1 contract developer AED 15k, 1 sales/onboarding exec from month 2 (AED 9k), 1 support agent from month 6 (AED 6k). Founder unpaid. Marketing AED 5k/mo, rising to 8k from month 4. Licence, legal and accounting about AED 2.5k/mo amortised. Infra steps from 1.5k to 4k. Payment fees are 3% of revenue.

| Month | Paying shops | Revenue | Infra + AI + payment fees | Team | Marketing + legal | Total costs | Net | Cumulative |
|---|---|---|---|---|---|---|---|---|
| 1 | 0 | 0 | 1,500 | 15,000 | 7,500 | 24,000 | -24,000 | -24,000 |
| 2 | 3 | 1,869 | 1,562 | 24,000 | 7,500 | 33,062 | -31,193 | -55,193 |
| 3 | 6 | 3,738 | 1,624 | 24,000 | 7,500 | 33,124 | -29,386 | -84,579 |
| 4 | 10 | 6,230 | 1,707 | 24,000 | 10,500 | 36,207 | -29,977 | -114,556 |
| 5 | 15 | 9,345 | 1,810 | 24,000 | 10,500 | 36,310 | -26,965 | -141,521 |
| 6 | 21 | 13,083 | 1,934 | 30,000 | 10,500 | 42,434 | -29,351 | -170,872 |
| 7 | 28 | 17,444 | 2,079 | 30,000 | 10,500 | 42,579 | -25,135 | -196,007 |
| 8 | 36 | 22,428 | 3,245 | 30,000 | 10,500 | 43,745 | -21,317 | -217,324 |
| 9 | 45 | 28,035 | 3,431 | 30,000 | 10,500 | 43,931 | -15,896 | -233,220 |
| 10 | 55 | 34,265 | 3,638 | 30,000 | 10,500 | 44,138 | -9,873 | -243,093 |
| 11 | 66 | 41,118 | 5,366 | 30,000 | 10,500 | 45,866 | -4,748 | -247,841 |
| 12 | 78 | 48,594 | 5,614 | 30,000 | 10,500 | 46,114 | 2,480 | -245,361 |

Year-one revenue is about **AED 226k**. Monthly break-even comes at about **75 paying shops**. Cumulative funding needed is about **AED 250k**, plus a 30% buffer, so **≈ AED 325k**. Exit ARR at month 12 is ≈ AED 583k.

Sensitivities: each ±10 shops at month 12 moves MRR by about ±AED 6.2k. Shifting 10 points of the mix from Starter to Growth adds about AED 30 ARPA.

## 9. Go-to-market

1. **Pilot (months 1–2):** 5 design-partner shops in Karama / Bur Dubai, free for 3 months in exchange for weekly feedback and a video testimonial. We do their onboarding: load their real price list and set up their Stripe or Mamo account.
2. **Field sales in clusters:** Karama, Bur Dubai, Deira and Al Qusais (Dubai); Rolla, Al Nahda and Al Qasimia (Sharjah); Ajman; Hamdan and Electra St and Musaffah (Abu Dhabi). Walk-in demos on a tablet: "your store is live in 5 minutes."
3. **Typing centres and PRO offices:** a huge flow of document, passport-photo and visa-photo printing. Offer them a reseller or referral margin.
4. **WhatsApp first:** every storefront link is built to be shared on WhatsApp, Instagram bio and Google Business Profile. A WhatsApp ordering bot is on the roadmap.
5. **Local SEO for shops:** "passport photo near me Karama" and "print documents Dubai Marina delivery". Storefront pages are SEO-ready per shop.
6. **Partnerships:** Mamo Pay (UAE SME payments) and courier aggregators for co-marketing. Free-zone business setup consultants can bundle "new licence → business cards" with a referral fee.
7. **Seasonal campaigns:** National Day, Ramadan/Eid gifting, back-to-school, GITEX and exhibition season.

## 10. Risks and compliance

| Area | Risk / requirement | Mitigation |
|---|---|---|
| **VAT (FTA)** | Shops must issue compliant tax invoices (TRN, 5% VAT shown) | Built in: VAT on every order, TRN on invoices. QuickPrint itself must register for VAT once over the mandatory threshold (AED 375k taxable supplies; confirm with a tax agent). |
| **E-invoicing** | The UAE has announced a phased e-invoicing mandate (rollout starting around 2026–2027, large businesses first) | Keep invoice data structured. Plan integration with an accredited service provider before the mandate reaches SMEs. Confirm dates with a tax advisor. |
| **Data protection (PDPL, Federal Decree-Law 45/2021)** | Confidential documents, passport and ID photos are sensitive personal data | Encryption at rest, auto-deletion after retention, access logs, in-region hosting (UAE/ME cloud region), DPA template for shops, privacy policy. Get legal review. |
| **Payments** | Becoming a payment facilitator needs licensing. Provider KYC can block shops. | Shops connect their **own** Stripe or Mamo Pay merchant accounts; we never hold their funds. Help shops through KYC during onboarding. |
| **Trade licence** | The SaaS company needs a licence covering software/IT services | Free-zone licence (e.g. a tech-focused free zone) is typically the cheapest route. Mainland only if selling to government. |
| **Content liability** | Customers uploading copyrighted, offensive or forged documents (e.g. fake IDs) | Terms of service, shop right to refuse, audit logs. Consider flagging uploads that look like official documents in confidential mode. |
| **Concentration** | Dependence on Stripe / Anthropic / couriers | Adapter architecture (payments, delivery, AI). The AI designer falls back to templates. |
| **Adoption** | Owners stick with WhatsApp | Done-for-you onboarding, a WhatsApp share flow, and proof of extra after-hours orders. |

## 11. Corrections to the original idea (co-founder's honest take)

1. **"No COD" is right, but it has a cost.** UAE consumers still use COD a lot for e-commerce. Expect some drop-off from first-time buyers. Mitigations: Apple Pay and Google Pay through Stripe (low friction), pay-by-link for WhatsApp customers, and later BNPL (Tabby/Tamara) for big corporate orders. Keep "pay at pickup" off. Unpaid jobs are what we are solving.
2. **Porter is primarily an India-based logistics brand. Verify its current UAE coverage before promising it.** For the UAE, the realistic courier set is aggregators and last-mile players such as Jeebly, Quiqup, Careem Box, Aramex and Shipa, plus the shop's own drivers. Most small shops will start with in-house delivery. The product supports all of these through adapters.
3. **"Qmore"** is probably **Quiqup** (a Dubai same-day delivery company). It is implemented under that name.
4. **Don't start with Desco-size companies.** Large players have in-house IT, ERPs and procurement cycles. Win small shops first, then sell a multi-branch Enterprise plan with case studies.
5. **SaaS before marketplace.** Building both at once splits focus. The SaaS creates the supply network a marketplace later needs.
6. **Add WhatsApp ordering early.** In the UAE, WhatsApp is the storefront for most small shops. A bot or deep link that turns a chat into a paid QuickPrint order will beat any SEO.
7. **Corporate (B2B) accounts are where the money is.** Real estate agencies, clinics, schools and PRO offices order repeatedly. Add credit/invoice terms, monthly statements and multiple users per company (roadmap v1.5).
8. **Passport photos need a compliance check, not just a size.** Background, head size and expression rules cause rejections. The "pro retouch + compliance check" upsell protects quality. An automated checker is on the roadmap.
9. **Arabic.** Customer-facing pages need Arabic and RTL support to reach Emirati and wider Arab customers. This is planned for v1.1.
10. **Pricing data is the moat.** Pre-loaded UAE price tables and options save every shop days of setup. Keep improving the defaults using anonymised data from the network.

## 12. Milestones and KPIs

| Milestone | Target |
|---|---|
| 5 pilot shops live | Month 2 |
| First 1,000 orders through the platform | Month 4 |
| 25 paying shops, < 4% monthly churn | Month 6 |
| 75+ paying shops, monthly break-even | Month 12 |

KPIs to track: paying shops, MRR, GMV per shop, orders per shop, trial→paid conversion (target 30%+), activation (first paid order within 7 days of signup), churn, CAC, support tickets per shop.
