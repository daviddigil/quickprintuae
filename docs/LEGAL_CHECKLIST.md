# Legal checklist: documents to prepare

**This is a preparation list, not legal advice.** Every item below needs review by a UAE-licensed lawyer (and the accountant where marked). Nothing here asserts what the law requires.

## A. Questions to put to the lawyer first (longest lead time)

1. Does the platform collecting customer payments on behalf of shops and paying them out need a licence or a regulated arrangement (for example a payment facilitator / merchant-acquirer or "retail payment services" arrangement under Central Bank of the UAE rules), or can it operate under the gateway's own marketplace programme (Mamo marketplace/recipients, Stripe Connect equivalent)? **Get legal advice before any real customer money is held.**
2. If a gateway programme is the route: which exact flow is allowed (funds held by the gateway versus our own bank account) and what does the gateway require from us (KYC of our sellers, terms flow-down)?
3. Mainland versus free-zone entity for the operating company; which jurisdiction governs the contracts.
4. Is the commission/SaaS fee structure caught by any regulated-activity definition?

## B. Contracts and policies to draft

| Document | Must cover (outline) | Owner |
|---|---|---|
| Seller (shop) agreement | Services and fees (subscription, commission, usage), payout schedule, hold days, reserves, minimum payout, set-off of refunds and chargebacks, prohibited and restricted items, IP/infringement takedown, licence and KYC duties, bank account rules, suspension and termination, liability caps, data processing roles, governing law | Lawyer |
| Customer terms of sale | Who the seller is (the shop), platform role, custom and personalised goods (no change-of-mind returns?), proofs and approval, delivery, cancellation, complaints | Lawyer |
| Refund and returns policy | Print defects, wrong item, late delivery, personalised-item rule, timelines, who pays, how refunds are funded from the ledger | Lawyer + Ops |
| Privacy policy (UAE PDPL, Federal Decree-Law 45/2021) | Controller/processor roles (platform vs shop), categories of data, purposes and legal basis, retention (confidential files deleted after N hours), processors (hosting, email, gateways, AI providers), cross-border transfers, data subject rights and a contact route, breach notification process | Lawyer + DPO-equivalent |
| Cookie notice | Session and security cookies only today; update if analytics are added | Lawyer |
| Acceptable use policy | Prohibited content (weapons, counterfeit, adult, hateful, government emblems), takedown flow | Lawyer |
| Data processing terms | Platform as processor for the shop's customer data; sub-processor list | Lawyer |
| AML / KYC policy | Seller onboarding checks (trade licence, signatory ID, beneficial owner), sanctions screening approach, red flags, record keeping, reporting contact | Lawyer + compliance |
| Dispute and chargeback procedure | Evidence, deadlines, who pays | Ops (see RUNBOOKS) |
| Incident and breach response plan | Roles, notification duties and timelines to confirm with the lawyer | Security lead |

## C. Tax and accounting (questions for the accountant)

1. VAT on the platform's own fees (subscription, commission, usage): 5% and when to register; place of supply for non-UAE shops.
2. Who issues the customer tax invoice for an order: the shop (supplier) with the platform acting as agent, or the platform? How commission is shown (the current invoices are issued by the shop).
3. Treatment of funds held for shops (client money) in the accounts; bank account structure (separate escrow or "client funds" account?).
4. Gateway fees: who bears them, VAT on them, how they are netted in payouts.
5. E-invoicing: UAE e-invoicing roll-out timeline and what the invoice data model (`order_settlements`, tax invoices) must carry (TRN, structured fields). Confirm readiness date.
6. Corporate tax and economic-substance questions for the operating entity; transfer pricing if there are related parties.
7. Withholding or reporting duties on payouts to shops.

## D. Seller KYC package (what we ask each shop for)

Trade licence (and its expiry), licensing authority, legal business name, authorised signatory name and Emirates ID/passport, shop owner email and phone, optional TRN, bank account in the business name (IBAN). Manual review (the UAE has no public licence lookup API); document retention period to be set by the lawyer.

## E. Operating-company housekeeping

Trade licence of the platform company, bank accounts, gateway merchant agreements (Stripe / Mamo) signed by an authorised signatory, domain ownership, insurance (cyber / professional indemnity) quote, trademark filing for the QuickPrint name and logo.
