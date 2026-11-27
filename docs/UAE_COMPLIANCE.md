# UAE compliance register

**Read this first.** This is an engineering register, not legal advice, and nobody can certify the platform "compliant" from code alone. It lists the obligations that typically apply to an online print marketplace in the UAE, what the app now does about each, and what still needs a UAE lawyer, the accountant, a regulator or you. Law references come from general knowledge plus public sources and **must be verified by the lawyer** (executive regulations, thresholds and dates change). All legal texts in the app are templates marked "Template for review". See also `LEGAL_CHECKLIST.md` (documents to prepare) and `SECURITY.md`.

Status legend: **App** = control built in the product. **Partly** = built, depends on a decision/text. **Lawyer** / **Accountant** / **You** = cannot be done in code.

## 1. Personal data (Federal Decree-Law 45/2021, PDPL)

| Obligation (summary) | Status | Where in the app |
|---|---|---|
| Transparency: say what data is collected, why, who gets it, transfers abroad | Partly: template text | `/privacy` (+ `/ar`), `/subprocessors` |
| Roles: shop = controller of its customers' data; QuickPrint = processor; DPA | Partly: template annex | Seller agreement annex (DPA) |
| Consent where it is the legal basis (marketing, analytics cookies) | App | Cookie banner, `consent_logs`, marketing opt-in unticked by default, `canSendMarketing()` |
| Data-subject rights: access, erasure, correction, objection, with a deadline | App | Customer account: download / delete my data; shop inbox `/admin/privacy-requests`; platform queue `/superadmin/privacy-requests`; deadline `DSR_DUE_DAYS` |
| Erasure vs. tax record keeping | App | `eraseCustomer()` anonymises personal fields, deletes uploaded files, keeps financial rows; refuses under legal hold |
| Retention limits and secure deletion | App | `RETENTION_SCHEDULE` in `src/lib/compliance.ts`, purge crons, confidential files auto-deleted |
| Security measures (encryption, access control, 2FA, logging) | App | `SECURITY.md` |
| Breach handling and notification | Partly: register + checklist, decision is legal | `/superadmin/incidents` |
| Cross-border transfer rules, any registration/DPO duty | **Lawyer** | open question L5 |
| Appoint a data contact / DPO if required | **You + Lawyer** | contact address placeholder in privacy text |

## 2. E-commerce, consumer protection, remote trading

| Obligation | Status | Where |
|---|---|---|
| Seller identity visible: legal/trade name, licence no. and authority, TRN, address, contact | App | Verified-seller identity block on storefront footer, checkout, order page and tax invoice (verified data only) |
| Clear price, VAT treatment, delivery terms before payment | App | Checkout price lines (incl./excl. VAT), shop returns policy shown before payment |
| Cancellation / returns / defect policy, personalised goods rule | Partly: editable template per shop | Admin settings (returns policy), `/refunds` |
| Complaints route | App | Complaint email per shop + `/report` |
| Order confirmation record | App | Order page and email |
| Arabic availability | Partly | Arabic legal pages and key storefront text; full storefront Arabic is roadmap |

## 3. VAT, invoicing and records

| Obligation | Status | Where |
|---|---|---|
| Tax invoice with TRN for each sale (issued by the shop) | App | `/admin/orders/[id]/invoice` |
| Platform's own tax invoices for subscriptions, commission, usage | Partly: needs the platform legal name/TRN | Superadmin settings: platform identity; SaaS invoices |
| Credit notes for refunds, gapless numbering | App | `credit_notes`, printable credit note page |
| Record retention (commonly 5 years: confirm) | App/Accountant | Tax records excluded from personal-data erasure; accountant CSV export |
| VAT registration, VAT on commission, place of supply, e-invoicing format and timeline | **Accountant** | questions A1-A4 |

## 4. Payments and money handling

| Obligation | Status | Where |
|---|---|---|
| Whether collecting customer money for shops and paying out needs a licence (Central Bank retail payment services) or must use Stripe Connect / gateway marketplace | **Lawyer + Stripe: blocker before real money** | `LEGAL_CHECKLIST.md` A1-A2 |
| Seller KYC (trade licence, signatory, duplicate guard, bank in business name) | App | Seller verification, payout accounts |
| Gateway keys held only by the superadmin; card data never touches us (hosted Checkout) | App | Stripe hosted pages |
| Reserve/hold/clawback and chargeback rules | Partly | Payout ledger; seller agreement |

## 5. Content, IP and misuse

| Obligation | Status | Where |
|---|---|---|
| Acceptable-use rules: unlawful, offensive, counterfeit, forged IDs | Partly: template | `/acceptable-use` |
| Customer confirms right to print; evidence stored | App | Checkout declaration stored on the order with version and time |
| Notice and takedown route | App | `/report`, `/superadmin/reports` |
| Shop may refuse / cancel with a reason | App | Admin order page: decline with reason |
| Platform can suspend a shop or block a customer | App | Superadmin tenant controls; block from report resolution |
| Trademark / IP ownership of the QuickPrint brand | **You** | register the trademark |

## 6. Marketing and messaging

| Obligation | Status | Where |
|---|---|---|
| Opt-in for marketing email/WhatsApp, easy opt-out | App | Account opt-in/out, consent log |
| Transactional messages allowed without opt-in | App | Order emails/WhatsApp are transactional only |
| Telecom regulator rules for bulk/promotional messages, WhatsApp template approval | **Lawyer / Meta** | before any marketing sends |

## 7. Company and operations

Trade licence and activity wording covering e-commerce/software and print services, trade-name display on the website, VAT registration, bank account, insurance, staff contracts, domain ownership: **You** (see `GO_LIVE.md`).

## Open questions for the UAE lawyer
- L1 Is holding customer funds and paying shops a regulated activity for us, or must it run through Stripe Connect / gateway marketplace terms?
- L2 Mainland vs free-zone company, governing law and courts for the contracts.
- L3 Approve or rewrite: Terms, Privacy, Refunds, Seller agreement (with DPA), Acceptable use, cookie notice, rights declaration wording (EN + AR).
- L4 Confirm retention periods in `RETENTION_SCHEDULE`, the data-subject response deadline, and breach notification duties and timing.
- L5 Cross-border transfers (Stripe, AI, email, hosting outside the UAE): what notices, contracts or registrations are required?
- L6 Is personalised/custom print exempt from change-of-mind returns, and how must that be shown?
- L7 Platform liability for shops' content and takedown timing.

## Open questions for the accountant
- A1 When to register for VAT and how to show platform fees on invoices; VAT on commission and usage.
- A2 Who issues the customer invoice for platform-routed payments (shop or platform as agent).
- A3 E-invoicing readiness date and required data fields (our invoice data is structured to support this).
- A4 Treatment of funds held for shops; bank/escrow structure; reporting on payouts.

## What the product cannot do
It cannot register your company, obtain licences, register for VAT, sign the Stripe Connect or any regulator agreement, or decide legal questions. Until the lawyer signs off the texts and answers L1, run **closed pilots only**, with real customer payments off or limited, as described in `GO_LIVE.md`.
