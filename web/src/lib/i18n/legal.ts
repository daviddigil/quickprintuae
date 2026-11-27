/**
 * Copy for the four legal pages (Terms, Privacy, Refunds, Seller agreement) and the signup acceptance checkbox, English + Arabic.
 * Kept in its own module on purpose (not in en.ts / ar.ts). Pure data + tiny helpers: safe in client components and tests.
 *
 * ALL TEXT HERE IS A TEMPLATE. A UAE-licensed lawyer must review it before launch (docs/LEGAL_CHECKLIST.md).
 * Facts we do not know are neutral placeholders in [square brackets]. Do not replace a placeholder with a guess.
 * `{trialDays}` is filled with the superadmin trial length (see getLegalCopy), like the rest of the marketing copy.
 *
 * Parity: both languages are typed as `LegalCopy`, so a missing key is a compile error; legal.test.ts also checks that
 * every document has the same number of sections, paragraphs and list items in en and ar.
 */
import { LEGAL_KEYS, type LegalKey } from "@/lib/legal";
import { fillTrialString, type TrialLocale } from "./trial";

export interface LegalSection { h: string; p?: string[]; ul?: string[]; /** paragraphs shown after the list */ after?: string[] }
export interface LegalDoc {
  /** <title> without the site suffix */
  title: string;
  /** meta description, 70 to 160 characters */
  description: string;
  h1: string;
  lead: string;
  sections: LegalSection[];
}
export interface LegalCopy {
  locale: TrialLocale;
  /** red/amber banner at the top of every legal page */
  notice: string;
  version: string;
  updated: string;
  toc: string;
  otherDocs: string;
  /** footer column title */
  footerTitle: string;
  /** footer / link labels */
  nav: Record<LegalKey, string>;
  /** signup checkbox, assembled around three links */
  accept: { lead: string; terms: string; sep1: string; privacy: string; sep2: string; seller: string; end: string; newTab: string; required: string };
  /** admin settings / superadmin lines are English-only, so no strings here */
  docs: Record<LegalKey, LegalDoc>;
}

export const MONTHS: Record<TrialLocale, string[]> = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  ar: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"],
};
/** "2026-11-27" -> "27 November 2026" / "27 نوفمبر 2026" (Western digits in both languages, like the rest of the site). */
export function formatLegalDate(iso: string, locale: TrialLocale): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${MONTHS[locale][Number(m[2]) - 1] ?? ""} ${m[1]}`;
}

export const en: LegalCopy = {
  locale: "en",
  notice: "Template for review: this text must be checked by a UAE lawyer before launch",
  version: "Version",
  updated: "Last updated",
  toc: "On this page",
  otherDocs: "Other legal documents",
  footerTitle: "Legal",
  nav: { terms: "Terms of Service", privacy: "Privacy Policy", refunds: "Refunds and cancellation", "seller-agreement": "Seller agreement" },
  accept: { lead: "I agree to the ", terms: "Terms of Service", sep1: ", ", privacy: "Privacy Policy", sep2: " and ", seller: "Seller Agreement", end: ".", newTab: "(opens in a new tab)", required: "Please tick the box to agree to the Terms, Privacy Policy and Seller Agreement." },
  docs: {
    /* ------------------------------------------------------------------ TERMS */
    terms: {
      title: "Terms of Service",
      description: "The terms for print shops that use QuickPrint UAE: your account, plans, trial, your customers and files, acceptable use and ending the service.",
      h1: "Terms of Service",
      lead: "These terms are the agreement between you (a print shop or other business using QuickPrint UAE) and the company that runs the platform. Please read them together with the Privacy Policy, the Refunds and cancellation policy and the Seller agreement.",
      sections: [
        { h: "1. Who we are and what these terms cover", p: [
          "QuickPrint UAE is an online platform, operated by Nexsofture Tech ([company legal name], trade licence no. [trade licence number], registered address [registered address]), that gives print shops in the UAE a storefront, an order queue, invoicing and related tools. In these terms \"we\", \"us\" and \"QuickPrint\" mean that company, and \"you\" means the shop and the person who signs up on its behalf.",
          "By creating an account or using the service you accept these terms. If you sign up for a business, you confirm that you are allowed to bind that business.",
        ] },
        { h: "2. The service", p: [
          "We provide software that lets you publish an online shop, take orders and payments, manage print jobs and send invoices. Some features (for example AI design help, WhatsApp ordering, the walk-in queue and the print agent) may need extra setup, may be limited by your plan, or may be charged by usage. We describe the plans and prices on the pricing page.",
          "QuickPrint is a software platform. We are not the printer, and we are not a party to the sale between you and your customers.",
        ] },
        { h: "3. Your account", ul: [
          "You must run a real business with, or in the process of obtaining, a valid UAE trade licence. We may ask you to verify the licence before live payments, payouts or public listing are switched on.",
          "Information you give us (shop name, owner, phone, email, licence, bank details) must be accurate and kept up to date.",
          "You are responsible for keeping your password and any two-factor codes safe, for the actions of your staff, and for everything done through your account. Tell us at once if you think it was accessed by someone else.",
          "One shop account is for one business. Do not create accounts to get around a suspension, a limit or a verification result.",
        ] },
        { h: "4. Free trial, plans and fees", p: [
          "New shops get a free trial of {trialDays}. A payment card is required to start it and the card is charged automatically when the trial ends, unless you cancel before then. Details, including how to cancel, are in the Refunds and cancellation policy.",
          "Depending on the plan you choose, you pay a monthly subscription, a commission on orders, usage charges (for example AI designs or WhatsApp messages), or a mix. Prices are in UAE dirhams (AED) and, unless stated otherwise, exclude 5% VAT. We may change prices or plans for the future; we will tell you in advance and the change will not apply to a period you already paid for.",
        ] },
        { h: "5. Your shop and your customers", p: ["You are the seller to your customers. This means you are responsible for:"], ul: [
          "your products, descriptions, prices, offers, delivery promises and turnaround times;",
          "producing and delivering orders, answering customer questions and handling complaints, returns and refunds to your customers;",
          "issuing correct tax invoices and meeting your own VAT, licensing, consumer-protection and other legal duties;",
          "your storefront terms and any additional terms you show to your customers.",
        ], after: ["Payments from your customers and payouts to you are covered by the Seller agreement."] },
        { h: "6. Your content and files", p: [
          "You keep all rights in the content you upload (logos, artwork, product text, customer files). You give us a limited licence to host, copy, process and display that content only as needed to run the service for you, including showing it on your storefront and sending it to the print agent or to service providers that help us run the platform.",
          "You promise that you, or your customers who upload to your shop, have the right to use the content, and that it does not infringe anyone's copyright, trademark, privacy or other rights. We may remove content after a valid complaint or if it breaks these terms.",
          "Customer files marked confidential are encrypted and deleted automatically after the retention period set in your shop settings (72 hours after the order is completed unless you change it). Walk-in files are deleted 24 hours after printing unless you change that setting. Files that were uploaded but never used in an order or quote are deleted after about 24 hours. You are responsible for keeping your own copies of anything you need.",
        ] },
        { h: "7. Acceptable use", p: ["You must not use QuickPrint to:"], ul: [
          "sell or print anything illegal in the UAE, or any item listed as prohibited in the Seller agreement;",
          "infringe intellectual property, or print counterfeit goods, government emblems or documents that could be used to deceive;",
          "send spam, harass people, or collect personal data you have no right to collect;",
          "attack, probe, overload or reverse engineer the platform, or bypass its limits, security or verification;",
          "upload malware, or content that is hateful, adult or otherwise unlawful.",
        ] },
        { h: "8. AI and WhatsApp features", p: [
          "Some features use artificial intelligence (for example designing a business card from a few details, or helping answer customers on WhatsApp). AI output can be wrong, incomplete or similar to other output. You must review designs, prices, quotes and messages before you rely on them or send them to a customer. You are responsible for what you publish or approve.",
          "WhatsApp messaging runs through Meta's WhatsApp Business platform and is also subject to Meta's terms and policies. We cannot guarantee delivery or the availability of third-party services.",
        ] },
        { h: "9. Availability, support and changes to the service", p: [
          "We aim to keep the service available and secure, but we do not promise it will be uninterrupted or error free. We may update, improve or remove features; if we remove a feature you pay for, we will tell you in advance and, where appropriate, adjust what you owe.",
          "Support is available by email at [support email].",
        ] },
        { h: "10. Suspension and ending the agreement", p: [
          "You can stop using the service and cancel at any time from your admin area or by writing to [support email].",
          "We may suspend or end your account, with notice where reasonable, if you break these terms or the Seller agreement, if we cannot verify your business, if there is a risk of fraud or harm, if payments fail, or if the law requires it. If we do, we will explain why unless the law stops us.",
          "After the account ends we keep what the law requires (for example invoices and payment records) and delete the rest as described in the Privacy Policy. You can ask for an export of your orders and customers before closing.",
        ] },
        { h: "11. Disclaimers and limit of liability", p: [
          "The service is provided \"as is\" to the extent the law allows. We are not liable for indirect or consequential loss, lost profit, lost data or lost business, or for problems caused by third parties such as payment providers, email providers, Meta, internet or hosting outages.",
          "Our total liability to you for any claim related to the service is limited to the fees you paid us in the [12] months before the event that caused the claim, except where the law does not allow a limit (for example for fraud or intentional wrongdoing). [Lawyer to confirm this clause.]",
        ] },
        { h: "12. Changes to these terms", p: ["We may update these terms. The version and date are shown at the top of this page. For material changes we will notify you by email or in your admin area before they apply, and you can cancel if you do not agree. Using the service after the change date means you accept the new version."] },
        { h: "13. Governing law and contact", p: [
          "These terms are governed by [governing law, for example the laws of the Emirate of Dubai and the federal laws of the UAE], and the courts of [venue / courts] have jurisdiction, unless mandatory law says otherwise. [Lawyer to confirm.]",
          "Contact: [support email]. Registered address: [registered address].",
        ] },
      ],
    },
    /* ---------------------------------------------------------------- PRIVACY */
    privacy: {
      title: "Privacy Policy",
      description: "How QuickPrint UAE handles personal data under the UAE PDPL: what we collect from shops and customers, why, how long we keep it, who gets it and your rights.",
      h1: "Privacy Policy",
      lead: "This policy explains what personal data QuickPrint UAE handles, why, who sees it, how long we keep it and what rights you have. It is written with the UAE Personal Data Protection Law (Federal Decree-Law No. 45 of 2021) in mind.",
      sections: [
        { h: "1. Who is responsible", p: [
          "Nexsofture Tech ([company legal name], [registered address]) operates QuickPrint UAE. Contact for privacy questions: [support email] (data protection contact: [name or role of the person responsible]).",
          "We act in two roles. For data about shop owners and staff and about our own website visitors, we decide why and how the data is used (we are the controller). For data about a shop's customers (their orders, files, phone numbers and messages), the shop decides what is collected and why, and we process it on the shop's behalf (we are the processor). A customer who wants to use their rights about an order should contact the shop first; we will help the shop respond.",
        ] },
        { h: "2. What data we handle", ul: [
          "Shop owners and staff: name, email, phone, password (stored only as a hash), emirate and address, shop name and branding, trade licence details and licence document, tax number, bank account details for payouts, login and security events, IP address and browser information.",
          "A shop's customers: name, phone number, email, delivery address, order details and history, notes, quote requests, and the files they upload for printing (documents, images, artwork, business card details). Walk-in customers give a mobile number and upload files from their phone.",
          "WhatsApp: the phone number and the messages (text, images, voice notes where enabled) sent to a shop's WhatsApp number, and the replies, when the shop uses WhatsApp ordering.",
          "Payments: we receive payment status, the last four digits and brand of a card, and gateway references. Full card numbers are entered with our payment provider and are not stored on our servers.",
          "Technical data: logs of requests and errors, security and audit records, cookies that keep you signed in and keep the service secure.",
        ] },
        { h: "3. Why we use it", ul: [
          "To provide the service: create accounts and storefronts, take and process orders and payments, run print queues, issue invoices, calculate commission and pay out the shop.",
          "To verify sellers and prevent fraud, abuse and chargebacks, and to keep the platform secure.",
          "To communicate with you: order and payment notices, password resets, support replies and important service messages.",
          "To provide AI features and WhatsApp ordering that you or a shop's customer asked for.",
          "To meet legal duties (tax and accounting records, responding to lawful requests) and to defend legal claims.",
          "To improve and run the service, using aggregate or limited data where possible. We do not sell personal data and we do not use customers' files to train AI models of our own.",
        ] },
        { h: "4. AI processing", p: [
          "When a shop or customer uses an AI feature (for example the business-card designer or WhatsApp assistant), the details they enter (such as name, title, company, contact details, a logo, or the message text) are sent to our AI provider, Anthropic, to produce the answer. Some features may also use image or other AI providers we name in our sub-processor list. We send only what is needed for the request. AI output may be inaccurate and should be reviewed by a person.",
        ] },
        { h: "5. Who we share data with", p: ["We share data only with the people and companies needed to run the service, under contracts that require them to protect it:"], ul: [
          "the shop you order from (it receives your order, contact details and files);",
          "payment providers (Stripe and the gateways we support) to take payments, handle refunds and detect fraud;",
          "an email provider to send transactional emails;",
          "Meta (WhatsApp Business platform) for WhatsApp messages;",
          "Anthropic and, where used, image or other AI providers for AI features;",
          "cloud hosting and file storage providers [hosting provider and region to be confirmed];",
          "professional advisers, authorities and courts where the law requires, and a buyer or successor if the business is transferred.",
        ], after: ["Some of these providers are outside the UAE. Where we transfer personal data abroad we do so as the law allows and we require appropriate protection. [Lawyer to confirm cross-border transfer wording and list of sub-processors.]"] },
        { h: "6. How long we keep data", ul: [
          "Files marked confidential: encrypted, and deleted automatically after the retention period in the shop's settings. The default is 72 hours after the order is completed.",
          "Walk-in print files: deleted 24 hours after printing by default (the shop can change this).",
          "Files uploaded but never used in an order or quote: deleted after about 24 hours.",
          "Order, invoice and payment records: kept for the period needed for tax, accounting and legal claims [retention period to be confirmed, for example 5 years].",
          "Account data: kept while the account is active and for a limited time after closing. Security and audit logs: kept for a limited period [period to be confirmed].",
          "Personal data we no longer need is deleted or anonymised.",
        ] },
        { h: "7. Security", p: [
          "We use measures such as encrypted connections (HTTPS), hashed passwords, optional two-factor sign-in, encryption of confidential files and stored secrets, access controls and audit logs, rate limits and file checks on uploads. No system is perfectly secure. If a breach affects your personal data in a way the law says we must report, we will notify the authority and the people affected as required.",
        ] },
        { h: "8. Your rights", p: ["Subject to the law, you may ask to access your personal data, correct it, delete it, restrict or object to some uses, receive a copy, and withdraw consent where we rely on it. To use these rights write to [support email]. We may need to confirm who you are. If you are a customer of a shop, the shop may be the right first contact. You can also complain to the UAE data protection authority."] },
        { h: "9. Cookies", p: ["We use cookies that are needed for sign-in, security and your preferences (for example language). We do not use advertising cookies today. If that changes we will update this policy and ask where required."] },
        { h: "10. Children", p: ["The service is for businesses and is not directed at children. Do not upload personal data about a child unless you are entitled to."] },
        { h: "11. Changes and contact", p: [
          "We may update this policy. The version and date are at the top of this page, and we will tell shops about material changes.",
          "Contact: [support email]. Registered address: [registered address].",
        ] },
      ],
    },
    /* ---------------------------------------------------------------- REFUNDS */
    refunds: {
      title: "Refunds and cancellation policy",
      description: "How the QuickPrint UAE free trial, subscription, usage charges and commission work, how to cancel, and who handles refunds for orders placed with a shop.",
      h1: "Refunds and cancellation policy",
      lead: "This page explains what you pay QuickPrint UAE as a shop, how the free trial and cancellation work, and how refunds work for your customers' orders.",
      sections: [
        { h: "1. Free trial", p: [
          "New shops get a free trial of {trialDays} on the plan they choose. You enter a payment card to start the trial, and nothing is charged during the trial.",
          "Unless you cancel before the trial ends, the card is charged automatically for the first billing period when the trial ends, and then at the start of each period until you cancel.",
        ] },
        { h: "2. How to cancel", ul: [
          "Sign in, open Billing in your admin area and choose Cancel subscription, or write to [support email] from your account email.",
          "Cancel before the trial ends to pay nothing. Cancel before a renewal date to avoid the next charge.",
          "After you cancel, your shop stays available until the end of the period you have already paid for (or the end of the trial), then it closes.",
        ] },
        { h: "3. Subscription fees", p: [
          "Subscription fees are charged in advance for each billing period and are for access to the service during that period. Once a paid period has started, we do not refund it for the days you do not use, unless the law requires it or we agree otherwise in writing. If we materially fail to provide the service, contact us within [number] days and we will review a fair credit or refund.",
          "If you change plan, the new price applies from the date shown when you confirm the change. [Lawyer and finance to confirm pro-rata rules.]",
        ] },
        { h: "4. Usage charges", p: ["Usage-based items (for example AI designs or WhatsApp messages beyond what your plan includes) are charged at the rates shown in your plan and billing page, usually with the next invoice. Usage that has already been delivered is not refundable, except where we made an error or the service failed. If you think a usage charge is wrong, contact us."] },
        { h: "5. Commission", p: ["On pay-per-order plans, or where your plan includes a commission, we take a commission on each paid order, as shown in your plan. The commission on an order is reversed in proportion if that order is refunded to the customer. Payment gateway fees may not be returned, depending on the gateway."] },
        { h: "6. Orders placed with a shop", p: [
          "When a customer buys from a shop, the shop is the seller. The shop decides and is responsible for its own returns, reprints and refund rules for its customers, and for telling customers about them (printed and personalised goods are often not returnable for a change of mind, but must be as described and free of defects). QuickPrint is not the seller and does not decide those refunds.",
          "When the shop approves a refund, or a chargeback is decided against the shop, the amount is returned to the customer through the original payment method and reduces or reverses the shop's next payouts, as set out in the Seller agreement.",
        ] },
        { h: "7. Failed payments", p: ["If a renewal payment fails we will tell you and try again. If it still fails, we may limit or suspend the shop until the payment is made."] },
        { h: "8. Your legal rights and contact", p: [
          "Nothing in this policy limits rights you have under UAE law that cannot be excluded.",
          "Questions: [support email]. Operated by Nexsofture Tech ([company legal name]).",
        ] },
      ],
    },
    /* -------------------------------------------------------- SELLER AGREEMENT */
    "seller-agreement": {
      title: "Seller agreement",
      description: "The agreement between QuickPrint UAE and each selling shop: licence checks, payments and payout batches, fees, chargebacks, prohibited items and liability.",
      h1: "Seller agreement",
      lead: "This agreement is between QuickPrint UAE, operated by Nexsofture Tech, and the shop that signs up (\"the Seller\"). It adds to the Terms of Service and covers selling, payments and payouts.",
      sections: [
        { h: "1. Parties and documents", p: [
          "QuickPrint UAE is operated by Nexsofture Tech ([company legal name], trade licence no. [trade licence number], [registered address]). The Seller is the business named when signing up. This agreement, the Terms of Service, the Privacy Policy and the Refunds and cancellation policy together form the whole agreement. If they conflict on selling, payments or payouts, this agreement applies.",
        ] },
        { h: "2. Verification of the Seller", p: ["Before live payments, payouts or public listing, the Seller must pass verification:"], ul: [
          "provide the business's valid UAE trade licence (number, issuing authority, expiry), the legal name, the authorised signatory and, if registered, the tax registration number (TRN), and upload a copy of the licence;",
          "give a bank account in the business's name for payouts;",
          "tell us promptly about changes and renew the licence documents before they expire.",
        ], after: ["We may check the information, refuse or remove a seller that fails verification, and keep a record of the checks. We may refuse sellers that were previously suspended or terminated."] },
        { h: "3. Selling on the platform", p: ["The Seller sells to its own customers in its own name. The Seller is responsible for the goods, prices, descriptions, production quality, delivery, customer service, tax invoices, VAT and compliance with law. QuickPrint provides the tools and is not a party to those sales."] },
        { h: "4. Payments through the platform gateway", p: [
          "Where the Seller uses platform payments, customers pay through the payment gateway connected to the platform. QuickPrint receives the funds as a collection agent for the Seller [lawyer to confirm the legal structure and any licence or payment-provider arrangement before live use], records each order in a ledger and pays the Seller what is due.",
          "The Seller authorises QuickPrint to collect customer payments on its behalf, to deduct the amounts described below, and to give the gateway and authorities the information they require.",
        ] },
        { h: "5. Fees, commission and usage", p: ["The Seller pays the subscription, commission and usage charges that apply to its plan, as shown on the pricing page and in its account when it signs up or changes plan. Commission is calculated on each paid order. Gateway fees are shown in the order settlement. We deduct fees and commission from payouts, or invoice them. Amounts exclude VAT unless stated, and VAT is added where it applies."] },
        { h: "6. Payout batches", ul: [
          "Paid orders become payable after a holding period [number of days, shown in the payouts page] that covers refunds and chargebacks.",
          "We pay out in batches [frequency, for example weekly or monthly] to the verified bank account, for the balance above the minimum payout amount [minimum amount].",
          "Each batch shows, per order, the gross amount, gateway fee, commission and net amount.",
          "Changing the bank account may pause payouts for a security review period [for example 48 hours] and may require re-verification. Payouts can be delayed or withheld while we investigate fraud, a dispute, a failed verification or a legal request.",
        ] },
        { h: "7. Refunds, chargebacks and reversals", p: [
          "The Seller decides refunds to its customers under its own policies and the law. A refund issued through the platform, and any chargeback or dispute lost by the Seller, reduce the Seller's balance by the refunded or disputed amount (and any gateway chargeback fee). We may set this off against later payouts. If there is no later payout to deduct from, the Seller must pay us the amount on request, and we may recover it by other lawful means.",
          "The Seller must respond to chargeback evidence requests within the deadline we give.",
        ] },
        { h: "8. Prohibited items and conduct", p: ["The Seller must not offer, print or promote:"], ul: [
          "anything illegal in the UAE, or that needs a licence the Seller does not hold;",
          "counterfeit or pirated goods, or items that infringe others' intellectual property;",
          "weapons, drugs, adult content, hate material, gambling items or items offensive to public morals;",
          "government or official emblems, identity documents, certificates or other documents that could be used to deceive;",
          "anything misleading, unsafe or in breach of consumer-protection rules.",
        ], after: ["We may remove listings, reject orders and suspend the shop for breaches, and we handle intellectual property complaints through a takedown process [process to be defined]."] },
        { h: "9. Data protection roles", p: ["For customer personal data the Seller is the controller and QuickPrint is the processor, as described in the Privacy Policy. The Seller must have a lawful basis for collecting customer data, show its own privacy information to customers, and use the data only to serve their orders. QuickPrint processes the data on the Seller's instructions, keeps it secure, uses the sub-processors listed in the Privacy Policy and helps the Seller respond to customer requests. [Detailed data processing terms to be added by the lawyer.]"] },
        { h: "10. Suspension and termination", p: [
          "We may suspend payouts, orders or the whole account, immediately where there is a risk of fraud, illegality or harm, a chargeback or complaint pattern, a failed or expired verification or a legal request, and otherwise with reasonable notice. Either side may end the agreement by notice. On termination the Seller stays responsible for open orders, refunds and chargebacks, and we pay out the balance due after deducting anything owed, once the hold period for refunds and chargebacks has passed.",
        ] },
        { h: "11. Liability", p: [
          "Each side is liable for loss it causes by breaching this agreement, but, to the extent the law allows, QuickPrint is not liable for indirect loss, lost profit or lost business, or for delays by payment gateways, banks or other third parties, and its total liability is limited to the fees the Seller paid in the [12] months before the claim. The Seller indemnifies QuickPrint against claims, fines and costs that arise from the Seller's goods, content, tax or legal compliance. [Lawyer to confirm these limits.]",
        ] },
        { h: "12. General", p: [
          "We may update this agreement by notice (see the version and date above). This agreement is governed by [governing law] and the courts of [venue / courts] have jurisdiction. Contact: [support email]. Registered address: [registered address].",
        ] },
      ],
    },
  },
};

export const ar: LegalCopy = {
  locale: "ar",
  notice: "نموذج للمراجعة: يجب أن يراجع محامٍ مرخّص في الإمارات هذا النص قبل الإطلاق",
  version: "الإصدار",
  updated: "آخر تحديث",
  toc: "في هذه الصفحة",
  otherDocs: "مستندات قانونية أخرى",
  footerTitle: "قانوني",
  nav: { terms: "شروط الخدمة", privacy: "سياسة الخصوصية", refunds: "الاسترداد والإلغاء", "seller-agreement": "اتفاقية البائع" },
  accept: { lead: "أوافق على ", terms: "شروط الخدمة", sep1: "، ", privacy: "سياسة الخصوصية", sep2: " و", seller: "اتفاقية البائع", end: ".", newTab: "(يُفتح في نافذة جديدة)", required: "يرجى تحديد المربع للموافقة على الشروط وسياسة الخصوصية واتفاقية البائع." },
  docs: {
    terms: {
      title: "شروط الخدمة",
      description: "شروط استخدام كويك برنت الإمارات للمطابع: الحساب والباقات والتجربة المجانية وعملاؤك وملفاتك والاستخدام المقبول وكيفية إنهاء الخدمة.",
      h1: "شروط الخدمة",
      lead: "هذه الشروط هي الاتفاق بينك (مطبعة أو نشاط تجاري يستخدم كويك برنت الإمارات) وبين الشركة التي تشغّل المنصة. يُرجى قراءتها مع سياسة الخصوصية وسياسة الاسترداد والإلغاء واتفاقية البائع.",
      sections: [
        { h: "1. من نحن وما الذي تغطيه هذه الشروط", p: [
          "كويك برنت الإمارات منصة إلكترونية تشغّلها شركة نكسوفتشر تك (Nexsofture Tech) ([الاسم القانوني للشركة]، رقم الرخصة التجارية [رقم الرخصة التجارية]، العنوان المسجّل [العنوان المسجّل])، وتوفّر للمطابع في الإمارات متجرًا إلكترونيًا وقائمة طلبات وفوترة وأدوات أخرى. في هذه الشروط تعني «نحن» و«كويك برنت» تلك الشركة، وتعني «أنت» المطبعة والشخص الذي يسجّل باسمها.",
          "بإنشاء حساب أو باستخدام الخدمة فإنك توافق على هذه الشروط. وإذا سجّلت باسم نشاط تجاري فإنك تقرّ بأن لك صلاحية إلزام ذلك النشاط.",
        ] },
        { h: "2. الخدمة", p: [
          "نوفّر برمجيات تتيح لك نشر متجر إلكتروني واستقبال الطلبات والمدفوعات وإدارة مهام الطباعة وإرسال الفواتير. وقد تحتاج بعض الميزات (مثل المساعدة في التصميم بالذكاء الاصطناعي والطلب عبر واتساب وطابور الطلبات الفورية ووكيل الطباعة) إلى إعداد إضافي، أو تكون محدودة حسب باقتك، أو تُحتسب بحسب الاستخدام. نعرض الباقات والأسعار في صفحة الأسعار.",
          "كويك برنت منصة برمجية. لسنا المطبعة، ولسنا طرفًا في عملية البيع بينك وبين عملائك.",
        ] },
        { h: "3. حسابك", ul: [
          "يجب أن تدير نشاطًا حقيقيًا لديه رخصة تجارية سارية في الإمارات أو في طور الحصول عليها. وقد نطلب منك توثيق الرخصة قبل تفعيل المدفوعات الحية أو التحويلات أو الظهور العام.",
          "يجب أن تكون المعلومات التي تقدّمها (اسم المتجر والمالك والهاتف والبريد والرخصة والبيانات البنكية) صحيحة ومحدّثة.",
          "أنت مسؤول عن حفظ كلمة المرور ورموز التحقق الثنائي، وعن تصرفات موظفيك، وعن كل ما يتم عبر حسابك. أخبرنا فورًا إذا ظننت أن شخصًا آخر دخل إلى حسابك.",
          "الحساب الواحد مخصّص لنشاط تجاري واحد. لا تنشئ حسابات للالتفاف على إيقاف أو حدّ أو نتيجة توثيق.",
        ] },
        { h: "4. التجربة المجانية والباقات والرسوم", p: [
          "يحصل كل متجر جديد على تجربة مجانية مدتها {trialDays}. تلزم بطاقة دفع لبدء التجربة، وتُخصم المبالغ من البطاقة تلقائيًا عند انتهاء التجربة ما لم تلغِ قبل ذلك. تجد التفاصيل، ومنها طريقة الإلغاء، في سياسة الاسترداد والإلغاء.",
          "بحسب الباقة التي تختارها، تدفع اشتراكًا شهريًا أو عمولة على الطلبات أو رسوم استخدام (مثل تصاميم الذكاء الاصطناعي أو رسائل واتساب) أو مزيجًا منها. الأسعار بالدرهم الإماراتي وهي لا تشمل ضريبة القيمة المضافة 5% ما لم يُذكر خلاف ذلك. قد نغيّر الأسعار أو الباقات للمستقبل، وسنخطرك مسبقًا ولن يسري التغيير على مدة دفعتَ عنها بالفعل.",
        ] },
        { h: "5. متجرك وعملاؤك", p: ["أنت البائع لعملائك. وهذا يعني أنك مسؤول عن:"], ul: [
          "منتجاتك ووصفها وأسعارك وعروضك ووعود التسليم ومدد التنفيذ؛",
          "تنفيذ الطلبات وتسليمها والرد على استفسارات العملاء ومعالجة الشكاوى والإرجاع والاسترداد لعملائك؛",
          "إصدار فواتير ضريبية صحيحة والوفاء بالتزاماتك في ضريبة القيمة المضافة والترخيص وحماية المستهلك وغيرها؛",
          "شروط متجرك وأي شروط إضافية تعرضها على عملائك.",
        ], after: ["مدفوعات عملائك والتحويلات المستحقة لك تنظّمها اتفاقية البائع."] },
        { h: "6. محتواك وملفاتك", p: [
          "تحتفظ بجميع الحقوق في المحتوى الذي ترفعه (الشعارات والتصاميم ونصوص المنتجات وملفات العملاء). وتمنحنا ترخيصًا محدودًا لاستضافة هذا المحتوى ونسخه ومعالجته وعرضه بالقدر اللازم لتشغيل الخدمة لك فقط، ويشمل ذلك عرضه في متجرك وإرساله إلى وكيل الطباعة أو إلى مزوّدي الخدمات الذين يساعدوننا في تشغيل المنصة.",
          "تتعهد بأنك، أو عملاءك الذين يرفعون ملفاتهم إلى متجرك، تملكون حق استخدام المحتوى وأنه لا ينتهك حقوق أحد في المؤلف أو العلامة التجارية أو الخصوصية أو غيرها. ويجوز لنا إزالة المحتوى بعد شكوى وجيهة أو إذا خالف هذه الشروط.",
          "الملفات التي تُعدّ سرّية تُشفَّر وتُحذف تلقائيًا بعد مدة الاحتفاظ المحددة في إعدادات متجرك (72 ساعة بعد اكتمال الطلب ما لم تغيّرها). وتُحذف ملفات الطلبات الفورية بعد 24 ساعة من الطباعة ما لم تغيّر هذا الإعداد. أما الملفات التي رُفعت ولم تُستخدم في طلب أو عرض سعر فتُحذف بعد نحو 24 ساعة. أنت مسؤول عن الاحتفاظ بنسخك الخاصة من كل ما تحتاجه.",
        ] },
        { h: "7. الاستخدام المقبول", p: ["يُحظر عليك استخدام كويك برنت من أجل:"], ul: [
          "بيع أو طباعة أي شيء مخالف للقانون في الإمارات، أو أي صنف مذكور في قائمة المحظورات في اتفاقية البائع؛",
          "انتهاك الملكية الفكرية، أو طباعة سلع مقلّدة أو شعارات حكومية أو مستندات يمكن استخدامها للتضليل؛",
          "إرسال رسائل مزعجة أو مضايقة الآخرين أو جمع بيانات شخصية لا تملك حق جمعها؛",
          "مهاجمة المنصة أو فحصها أو إرهاقها أو إجراء هندسة عكسية لها، أو تجاوز حدودها أو أمنها أو التوثيق فيها؛",
          "رفع برمجيات خبيثة أو محتوى يحرّض على الكراهية أو محتوى للبالغين أو أي محتوى غير مشروع.",
        ] },
        { h: "8. ميزات الذكاء الاصطناعي وواتساب", p: [
          "تستخدم بعض الميزات الذكاء الاصطناعي (مثل تصميم بطاقة أعمال من بيانات قليلة، أو المساعدة في الرد على العملاء عبر واتساب). قد تكون مخرجات الذكاء الاصطناعي خاطئة أو ناقصة أو مشابهة لمخرجات أخرى. عليك مراجعة التصاميم والأسعار وعروض الأسعار والرسائل قبل الاعتماد عليها أو إرسالها إلى عميل، وأنت مسؤول عمّا تنشره أو تعتمده.",
          "تعمل المراسلة عبر واتساب من خلال منصة واتساب للأعمال التابعة لشركة ميتا، وتخضع كذلك لشروط ميتا وسياساتها. ولا نضمن وصول الرسائل أو توفّر خدمات الأطراف الثالثة.",
        ] },
        { h: "9. التوفّر والدعم والتغييرات على الخدمة", p: [
          "نسعى إلى إبقاء الخدمة متاحة وآمنة، لكننا لا نعد بأنها ستعمل دون انقطاع أو دون أخطاء. وقد نحدّث الميزات أو نحسّنها أو نزيلها، وإذا أزلنا ميزة تدفع مقابلها فسنخطرك مسبقًا ونعدّل ما يترتب عليك عند الاقتضاء.",
          "الدعم متاح عبر البريد الإلكتروني: [البريد الإلكتروني للدعم].",
        ] },
        { h: "10. الإيقاف وإنهاء الاتفاق", p: [
          "يمكنك التوقف عن استخدام الخدمة وإلغاء الاشتراك في أي وقت من لوحة الإدارة أو بمراسلتنا على [البريد الإلكتروني للدعم].",
          "يجوز لنا إيقاف حسابك أو إنهاؤه، مع إشعار حيثما كان ذلك معقولًا، إذا خالفت هذه الشروط أو اتفاقية البائع، أو تعذّر توثيق نشاطك، أو وُجد خطر احتيال أو ضرر، أو فشلت المدفوعات، أو اقتضى القانون ذلك. وسنوضح السبب ما لم يمنعنا القانون.",
          "بعد إغلاق الحساب نحتفظ بما يوجبه القانون (مثل الفواتير وسجلات الدفع) ونحذف الباقي كما هو موضح في سياسة الخصوصية. ويمكنك طلب تصدير طلباتك وعملائك قبل الإغلاق.",
        ] },
        { h: "11. إخلاء المسؤولية وحدود المسؤولية", p: [
          "تُقدَّم الخدمة «كما هي» بالقدر الذي يسمح به القانون. ولا نتحمل المسؤولية عن الخسائر غير المباشرة أو التبعية، أو فوات الربح، أو فقدان البيانات أو الأعمال، أو عن المشكلات التي يسببها أطراف ثالثة مثل مزوّدي الدفع والبريد الإلكتروني وميتا وانقطاعات الإنترنت أو الاستضافة.",
          "تقتصر مسؤوليتنا الإجمالية تجاهك عن أي مطالبة متعلقة بالخدمة على الرسوم التي دفعتها لنا خلال [12] شهرًا قبل الواقعة المسببة للمطالبة، إلا حيث لا يجيز القانون وضع حد (مثل الاحتيال أو الخطأ المتعمّد). [على المحامي تأكيد هذا البند.]",
        ] },
        { h: "12. تعديل هذه الشروط", p: ["قد نحدّث هذه الشروط. يظهر الإصدار والتاريخ في أعلى هذه الصفحة. وعند إجراء تعديلات جوهرية سنخطرك عبر البريد الإلكتروني أو لوحة الإدارة قبل سريانها، ويمكنك الإلغاء إن لم توافق. ويعني استمرارك في استخدام الخدمة بعد تاريخ التعديل قبولك للإصدار الجديد."] },
        { h: "13. القانون الواجب التطبيق والتواصل", p: [
          "تخضع هذه الشروط لـ [القانون الواجب التطبيق، مثل قوانين إمارة دبي والقوانين الاتحادية في دولة الإمارات]، وتختص بها محاكم [جهة الاختصاص / المحاكم] ما لم يقضِ قانون آمر بخلاف ذلك. [على المحامي التأكيد.]",
          "للتواصل: [البريد الإلكتروني للدعم]. العنوان المسجّل: [العنوان المسجّل].",
        ] },
      ],
    },
    privacy: {
      title: "سياسة الخصوصية",
      description: "كيف تتعامل كويك برنت الإمارات مع البيانات الشخصية وفق قانون حماية البيانات الإماراتي: ما نجمعه من المتاجر وعملائها ولماذا ومدة الاحتفاظ وحقوقك.",
      h1: "سياسة الخصوصية",
      lead: "توضّح هذه السياسة ما هي البيانات الشخصية التي تتعامل معها كويك برنت الإمارات، ولماذا، ومن يطّلع عليها، ومدة الاحتفاظ بها، وما حقوقك. وقد رُوعي في صياغتها قانون حماية البيانات الشخصية في دولة الإمارات (المرسوم بقانون اتحادي رقم 45 لسنة 2021).",
      sections: [
        { h: "1. الجهة المسؤولة", p: [
          "تشغّل شركة نكسوفتشر تك (Nexsofture Tech) ([الاسم القانوني للشركة]، [العنوان المسجّل]) منصة كويك برنت الإمارات. للتواصل في شؤون الخصوصية: [البريد الإلكتروني للدعم] (جهة الاتصال لحماية البيانات: [اسم أو صفة المسؤول]).",
          "نعمل بصفتين. بالنسبة لبيانات أصحاب المتاجر وموظفيها وزوار موقعنا، نحدّد نحن سبب استخدام البيانات وكيفيته (نحن المتحكّم بالبيانات). أما بيانات عملاء المتجر (طلباتهم وملفاتهم وأرقام هواتفهم ورسائلهم) فيحدّد المتجر ما يُجمع ولماذا، ونعالجها نيابة عنه (نحن المعالِج). وعلى العميل الذي يريد ممارسة حقوقه بشأن طلب ما أن يتواصل مع المتجر أولًا، وسنساعد المتجر في الاستجابة.",
        ] },
        { h: "2. البيانات التي نتعامل معها", ul: [
          "أصحاب المتاجر والموظفون: الاسم والبريد والهاتف وكلمة المرور (تُخزَّن على هيئة بصمة مشفّرة فقط) والإمارة والعنوان واسم المتجر وهويته البصرية وبيانات الرخصة التجارية ووثيقتها والرقم الضريبي وبيانات الحساب البنكي للتحويلات وسجلات الدخول والأمان وعنوان IP ومعلومات المتصفح.",
          "عملاء المتجر: الاسم ورقم الهاتف والبريد وعنوان التوصيل وتفاصيل الطلبات وسجلها والملاحظات وطلبات عروض الأسعار والملفات التي يرفعونها للطباعة (مستندات وصور وتصاميم وبيانات بطاقات الأعمال). ويقدّم عملاء الطلب الفوري رقم جوال ويرفعون ملفاتهم من هواتفهم.",
          "واتساب: رقم الهاتف والرسائل (نصوص وصور ورسائل صوتية حيثما فُعّلت) الواردة إلى رقم واتساب الخاص بالمتجر والردود عليها، عندما يستخدم المتجر الطلب عبر واتساب.",
          "المدفوعات: نستلم حالة الدفع وآخر أربعة أرقام من البطاقة ونوعها والمراجع الخاصة بالبوابة. أما أرقام البطاقات الكاملة فتُدخل لدى مزوّد الدفع ولا تُخزَّن على خوادمنا.",
          "البيانات التقنية: سجلات الطلبات والأخطاء وسجلات الأمان والتدقيق وملفات تعريف الارتباط التي تُبقيك مسجّلًا للدخول وتحمي الخدمة.",
        ] },
        { h: "3. لماذا نستخدمها", ul: [
          "لتقديم الخدمة: إنشاء الحسابات والمتاجر واستقبال الطلبات والمدفوعات ومعالجتها وتشغيل طوابير الطباعة وإصدار الفواتير وحساب العمولة وتحويل المستحقات إلى المتجر.",
          "للتحقق من البائعين ومنع الاحتيال وإساءة الاستخدام والمطالبات المرتدّة وحماية المنصة.",
          "للتواصل معك: إشعارات الطلبات والدفع وإعادة تعيين كلمة المرور وردود الدعم ورسائل الخدمة المهمة.",
          "لتقديم ميزات الذكاء الاصطناعي والطلب عبر واتساب التي طلبتها أنت أو عميل المتجر.",
          "للوفاء بالالتزامات القانونية (سجلات الضرائب والمحاسبة والاستجابة للطلبات القانونية) وللدفاع عن المطالبات القانونية.",
          "لتحسين الخدمة وتشغيلها، باستخدام بيانات مجمّعة أو محدودة قدر الإمكان. نحن لا نبيع البيانات الشخصية، ولا نستخدم ملفات العملاء لتدريب نماذج ذكاء اصطناعي خاصة بنا.",
        ] },
        { h: "4. المعالجة بالذكاء الاصطناعي", p: [
          "عندما يستخدم متجر أو عميل ميزة ذكاء اصطناعي (مثل مصمّم بطاقات الأعمال أو مساعد واتساب)، تُرسل البيانات التي يدخلها (كالاسم والمسمى والشركة وبيانات التواصل وشعار أو نص الرسالة) إلى مزوّدنا للذكاء الاصطناعي، أنثروبيك (Anthropic)، لإنتاج الإجابة. وقد تستخدم بعض الميزات كذلك مزوّدي صور أو ذكاء اصطناعي آخرين نذكرهم في قائمة المعالِجين الفرعيين. لا نرسل إلا ما يلزم للطلب. وقد تكون مخرجات الذكاء الاصطناعي غير دقيقة، ويجب أن يراجعها شخص.",
        ] },
        { h: "5. مع من نشارك البيانات", p: ["لا نشارك البيانات إلا مع من يلزم لتشغيل الخدمة، وبموجب عقود تُلزمهم بحمايتها:"], ul: [
          "المتجر الذي تطلب منه (يستلم طلبك وبيانات التواصل والملفات)؛",
          "مزوّدو الدفع (سترايب والبوابات التي ندعمها) لاستلام المدفوعات ومعالجة الاستردادات وكشف الاحتيال؛",
          "مزوّد البريد الإلكتروني لإرسال الرسائل الخاصة بالمعاملات؛",
          "ميتا (منصة واتساب للأعمال) لرسائل واتساب؛",
          "أنثروبيك، وعند الاستخدام مزوّدو الصور أو الذكاء الاصطناعي الآخرون، لميزات الذكاء الاصطناعي؛",
          "مزوّدو الاستضافة السحابية وتخزين الملفات [مزوّد الاستضافة والمنطقة قيد التأكيد]؛",
          "المستشارون المهنيون والجهات الرسمية والمحاكم حيث يوجب القانون ذلك، والمشتري أو الخلف عند نقل النشاط.",
        ], after: ["يقع بعض هؤلاء المزوّدين خارج الإمارات. وعند نقل البيانات الشخصية إلى الخارج نفعل ذلك وفق ما يجيزه القانون ونشترط حماية مناسبة. [على المحامي تأكيد صياغة النقل عبر الحدود وقائمة المعالِجين الفرعيين.]"] },
        { h: "6. مدة الاحتفاظ بالبيانات", ul: [
          "الملفات السرّية: تُشفَّر وتُحذف تلقائيًا بعد مدة الاحتفاظ المحددة في إعدادات المتجر. والمدة الافتراضية 72 ساعة بعد اكتمال الطلب.",
          "ملفات الطباعة الفورية: تُحذف بعد 24 ساعة من الطباعة افتراضيًا (ويمكن للمتجر تغيير ذلك).",
          "الملفات التي رُفعت ولم تُستخدم في طلب أو عرض سعر: تُحذف بعد نحو 24 ساعة.",
          "سجلات الطلبات والفواتير والمدفوعات: نحتفظ بها للمدة اللازمة للضرائب والمحاسبة والمطالبات القانونية [المدة قيد التأكيد، مثل 5 سنوات].",
          "بيانات الحساب: نحتفظ بها ما دام الحساب نشطًا ولمدة محدودة بعد إغلاقه. سجلات الأمان والتدقيق: نحتفظ بها لمدة محدودة [المدة قيد التأكيد].",
          "نحذف البيانات الشخصية التي لم نعد بحاجة إليها أو نجعلها مجهولة الهوية.",
        ] },
        { h: "7. الأمان", p: [
          "نطبّق تدابير منها الاتصالات المشفّرة (HTTPS) وتجزئة كلمات المرور والتحقق الثنائي الاختياري وتشفير الملفات السرّية والأسرار المخزّنة وضوابط الوصول وسجلات التدقيق وحدود معدلات الطلبات وفحص الملفات المرفوعة. لا يوجد نظام آمن بالكامل. وإذا أثّر اختراق على بياناتك الشخصية بما يوجب القانون الإبلاغ عنه، فسنخطر الجهة المختصة والأشخاص المتأثرين وفق المطلوب.",
        ] },
        { h: "8. حقوقك", p: ["وفقًا للقانون، يمكنك طلب الاطلاع على بياناتك الشخصية وتصحيحها وحذفها وتقييد بعض الاستخدامات أو الاعتراض عليها والحصول على نسخة منها، وسحب موافقتك حيث نعتمد عليها. لممارسة هذه الحقوق راسلنا على [البريد الإلكتروني للدعم]. وقد نحتاج إلى التحقق من هويتك. وإذا كنت عميلًا لدى متجر، فقد يكون المتجر هو جهة التواصل الأولى المناسبة. ويمكنك أيضًا تقديم شكوى إلى جهة حماية البيانات في الإمارات."] },
        { h: "9. ملفات تعريف الارتباط", p: ["نستخدم ملفات تعريف الارتباط اللازمة لتسجيل الدخول والأمان وتفضيلاتك (مثل اللغة). ولا نستخدم ملفات إعلانية حاليًا. وإذا تغيّر ذلك فسنحدّث هذه السياسة ونطلب الموافقة حيث يلزم."] },
        { h: "10. الأطفال", p: ["الخدمة مخصّصة للأنشطة التجارية وليست موجّهة للأطفال. لا ترفع بيانات شخصية عن طفل ما لم يكن لك الحق في ذلك."] },
        { h: "11. التعديلات والتواصل", p: [
          "قد نحدّث هذه السياسة. يظهر الإصدار والتاريخ في أعلى هذه الصفحة، وسنخطر المتاجر بالتعديلات الجوهرية.",
          "للتواصل: [البريد الإلكتروني للدعم]. العنوان المسجّل: [العنوان المسجّل].",
        ] },
      ],
    },
    refunds: {
      title: "سياسة الاسترداد والإلغاء",
      description: "كيف تعمل التجربة المجانية والاشتراك ورسوم الاستخدام والعمولة في كويك برنت الإمارات، وطريقة الإلغاء، ومن يتولى استرداد طلبات العملاء لدى المتجر.",
      h1: "سياسة الاسترداد والإلغاء",
      lead: "توضّح هذه الصفحة ما تدفعه لكويك برنت الإمارات بصفتك متجرًا، وكيف تعمل التجربة المجانية والإلغاء، وكيف يتم الاسترداد في طلبات عملائك.",
      sections: [
        { h: "1. التجربة المجانية", p: [
          "يحصل كل متجر جديد على تجربة مجانية مدتها {trialDays} على الباقة التي يختارها. تُدخل بطاقة دفع لبدء التجربة، ولا يُخصم منها أي مبلغ خلال التجربة.",
          "ما لم تلغِ قبل انتهاء التجربة، تُخصم من البطاقة تلقائيًا قيمة أول فترة فوترة عند انتهاء التجربة، ثم في بداية كل فترة إلى أن تلغي.",
        ] },
        { h: "2. كيفية الإلغاء", ul: [
          "سجّل الدخول وافتح «الفوترة» في لوحة الإدارة واختر «إلغاء الاشتراك»، أو راسلنا على [البريد الإلكتروني للدعم] من بريد حسابك.",
          "ألغِ قبل انتهاء التجربة كي لا تدفع شيئًا، وألغِ قبل موعد التجديد لتفادي الخصم التالي.",
          "بعد الإلغاء يبقى متجرك متاحًا حتى نهاية الفترة التي دفعتَ عنها (أو نهاية التجربة) ثم يُغلق.",
        ] },
        { h: "3. رسوم الاشتراك", p: [
          "تُحصَّل رسوم الاشتراك مقدمًا عن كل فترة فوترة، وهي مقابل الوصول إلى الخدمة خلال تلك الفترة. وبعد بدء الفترة المدفوعة لا نردّ قيمتها عن الأيام التي لم تستخدمها، إلا إذا أوجب القانون ذلك أو اتفقنا كتابةً على خلافه. وإذا أخللنا إخلالًا جوهريًا بتقديم الخدمة فتواصل معنا خلال [عدد] أيام وسندرس منحك رصيدًا أو استردادًا عادلًا.",
          "إذا غيّرت باقتك فيسري السعر الجديد من التاريخ الظاهر عند تأكيد التغيير. [على المحامي والمالية تأكيد قواعد التناسب الزمني.]",
        ] },
        { h: "4. رسوم الاستخدام", p: ["تُحتسب بنود الاستخدام (مثل تصاميم الذكاء الاصطناعي أو رسائل واتساب التي تتجاوز ما تشمله باقتك) بالأسعار الظاهرة في باقتك وصفحة الفوترة، وعادةً مع الفاتورة التالية. والاستخدام الذي تم تقديمه فعلًا غير قابل للاسترداد، إلا عند وقوع خطأ منّا أو تعطّل الخدمة. إذا رأيت أن رسم استخدام غير صحيح فتواصل معنا."] },
        { h: "5. العمولة", p: ["في باقات الدفع لكل طلب، أو حين تتضمن باقتك عمولة، نأخذ عمولة على كل طلب مدفوع كما هو مبيّن في باقتك. وتُعاد عمولة الطلب بالتناسب إذا استُرد مبلغ ذلك الطلب للعميل. وقد لا تُردّ رسوم بوابة الدفع، بحسب البوابة."] },
        { h: "6. الطلبات المقدّمة إلى المتجر", p: [
          "عندما يشتري عميل من متجر فإن المتجر هو البائع. والمتجر هو الذي يضع قواعد الإرجاع وإعادة الطباعة والاسترداد لعملائه ويتحمل مسؤوليتها وإبلاغ العملاء بها (المنتجات المطبوعة والمخصّصة لا تُرجَع غالبًا لمجرد تغيير الرأي، لكن يجب أن تطابق الوصف وتخلو من العيوب). كويك برنت ليست البائع ولا تقرّر هذه الاستردادات.",
          "عندما يوافق المتجر على استرداد، أو يُحسم نزاع مطالبة مرتدّة ضد المتجر، يُعاد المبلغ إلى العميل بطريقة الدفع الأصلية ويُخصم من تحويلات المتجر القادمة أو يُعكس منها، كما هو مبيّن في اتفاقية البائع.",
        ] },
        { h: "7. المدفوعات الفاشلة", p: ["إذا فشلت دفعة تجديد فسنخبرك ونعيد المحاولة. وإذا استمر الفشل فقد نقيّد المتجر أو نوقفه إلى أن يتم الدفع."] },
        { h: "8. حقوقك القانونية والتواصل", p: [
          "لا تقيّد هذه السياسة أي حقوق لك بموجب القانون الإماراتي لا يجوز الاتفاق على استبعادها.",
          "للاستفسار: [البريد الإلكتروني للدعم]. تشغّلها شركة نكسوفتشر تك ([الاسم القانوني للشركة]).",
        ] },
      ],
    },
    "seller-agreement": {
      title: "اتفاقية البائع",
      description: "الاتفاق بين كويك برنت الإمارات وكل متجر يبيع عبرها: توثيق الرخصة والمدفوعات ودفعات التحويل والرسوم والاستردادات والمطالبات المرتدّة والمحظورات والمسؤولية.",
      h1: "اتفاقية البائع",
      lead: "هذه الاتفاقية بين كويك برنت الإمارات، التي تشغّلها نكسوفتشر تك، والمتجر الذي يسجّل («البائع»). وهي تضاف إلى شروط الخدمة وتغطي البيع والمدفوعات والتحويلات.",
      sections: [
        { h: "1. الأطراف والمستندات", p: [
          "تشغّل شركة نكسوفتشر تك ([الاسم القانوني للشركة]، رقم الرخصة التجارية [رقم الرخصة التجارية]، [العنوان المسجّل]) منصة كويك برنت الإمارات. والبائع هو النشاط التجاري المذكور عند التسجيل. وتشكّل هذه الاتفاقية وشروط الخدمة وسياسة الخصوصية وسياسة الاسترداد والإلغاء معًا الاتفاق الكامل. وإذا تعارضت في أمور البيع أو المدفوعات أو التحويلات فتسري هذه الاتفاقية.",
        ] },
        { h: "2. توثيق البائع", p: ["قبل تفعيل المدفوعات الحية أو التحويلات أو الظهور العام، يجب أن يجتاز البائع التوثيق:"], ul: [
          "تقديم الرخصة التجارية السارية للنشاط في الإمارات (الرقم وجهة الإصدار وتاريخ الانتهاء) والاسم القانوني والمفوّض بالتوقيع ورقم التسجيل الضريبي إن وُجد، ورفع نسخة من الرخصة؛",
          "تقديم حساب بنكي باسم النشاط لاستلام التحويلات؛",
          "إبلاغنا بالتغييرات فورًا وتجديد مستندات الرخصة قبل انتهائها.",
        ], after: ["يجوز لنا التحقق من المعلومات، ورفض البائع الذي لا يجتاز التوثيق أو إزالته، والاحتفاظ بسجل لهذه الفحوصات. ويجوز لنا رفض البائعين الذين سبق إيقافهم أو إنهاء التعامل معهم."] },
        { h: "3. البيع عبر المنصة", p: ["يبيع البائع لعملائه باسمه الخاص. والبائع مسؤول عن السلع والأسعار والوصف وجودة التنفيذ والتسليم وخدمة العملاء والفواتير الضريبية وضريبة القيمة المضافة والالتزام بالقانون. وتوفّر كويك برنت الأدوات ولا تكون طرفًا في تلك المبيعات."] },
        { h: "4. المدفوعات عبر بوابة المنصة", p: [
          "عندما يستخدم البائع مدفوعات المنصة، يدفع العملاء عبر بوابة الدفع المرتبطة بالمنصة. وتستلم كويك برنت الأموال بصفتها وكيل تحصيل عن البائع [على المحامي تأكيد الهيكل القانوني وأي ترخيص أو ترتيب مع مزوّد الدفع قبل التشغيل الفعلي]، وتسجّل كل طلب في دفتر حسابات، وتدفع للبائع ما يستحقه.",
          "يفوّض البائع كويك برنت بتحصيل مدفوعات العملاء نيابةً عنه، وبخصم المبالغ المبيّنة أدناه، وبتزويد البوابة والجهات الرسمية بالمعلومات التي تطلبها.",
        ] },
        { h: "5. الرسوم والعمولة والاستخدام", p: ["يدفع البائع رسوم الاشتراك والعمولة والاستخدام المطبّقة على باقته كما هي معروضة في صفحة الأسعار وفي حسابه عند التسجيل أو تغيير الباقة. وتُحتسب العمولة على كل طلب مدفوع. وتظهر رسوم البوابة في تسوية الطلب. نخصم الرسوم والعمولة من التحويلات أو نصدر بها فاتورة. وتُحتسب المبالغ دون ضريبة القيمة المضافة ما لم يُذكر خلاف ذلك، وتُضاف الضريبة حيثما تنطبق."] },
        { h: "6. دفعات التحويل", ul: [
          "تصبح الطلبات المدفوعة مستحقة التحويل بعد فترة احتجاز [عدد الأيام، وتظهر في صفحة التحويلات] تغطي الاستردادات والمطالبات المرتدّة.",
          "ندفع على شكل دفعات [التكرار، مثل أسبوعيًا أو شهريًا] إلى الحساب البنكي الموثّق، عن الرصيد الذي يتجاوز الحد الأدنى للتحويل [الحد الأدنى].",
          "تُظهر كل دفعة، لكل طلب، المبلغ الإجمالي ورسوم البوابة والعمولة والصافي.",
          "قد يؤدي تغيير الحساب البنكي إلى إيقاف التحويلات مؤقتًا لمراجعة أمنية [مثل 48 ساعة] وقد يتطلب إعادة التوثيق. ويجوز تأجيل التحويلات أو حجبها أثناء التحقيق في احتيال أو نزاع أو فشل توثيق أو طلب قانوني.",
        ] },
        { h: "7. الاستردادات والمطالبات المرتدّة والعكس", p: [
          "يقرّر البائع الاستردادات لعملائه وفق سياساته والقانون. وأي استرداد يتم عبر المنصة، وأي مطالبة مرتدّة أو نزاع يخسره البائع، يخفّض رصيد البائع بمقدار المبلغ المسترد أو المتنازع عليه (وأي رسوم مطالبة مرتدّة تفرضها البوابة). ويجوز لنا مقاصّة ذلك من التحويلات اللاحقة. وإذا لم تكن هناك تحويلات لاحقة يُخصم منها، فعلى البائع سداد المبلغ لنا عند الطلب، ويجوز لنا استرداده بوسائل مشروعة أخرى.",
          "على البائع الرد على طلبات أدلة المطالبات المرتدّة ضمن المهلة التي نحددها.",
        ] },
        { h: "8. الأصناف والسلوكيات المحظورة", p: ["يُحظر على البائع عرض أو طباعة أو ترويج:"], ul: [
          "أي شيء مخالف للقانون في الإمارات أو يتطلب ترخيصًا لا يملكه البائع؛",
          "السلع المقلّدة أو المقرصنة أو ما ينتهك الملكية الفكرية للآخرين؛",
          "الأسلحة والمخدرات ومحتوى البالغين ومواد الكراهية وأدوات القمار وما يخالف الآداب العامة؛",
          "الشعارات الحكومية أو الرسمية ووثائق الهوية والشهادات أو غيرها من المستندات التي قد تُستخدم للتضليل؛",
          "كل ما هو مضلِّل أو غير آمن أو مخالف لقواعد حماية المستهلك.",
        ], after: ["يجوز لنا إزالة المنتجات المعروضة ورفض الطلبات وإيقاف المتجر عند المخالفة، ونعالج شكاوى الملكية الفكرية عبر إجراء لإزالة المحتوى [الإجراء قيد التحديد]."] },
        { h: "9. أدوار حماية البيانات", p: ["بالنسبة لبيانات العملاء الشخصية، البائع هو المتحكّم بالبيانات وكويك برنت هي المعالِج، كما هو موضح في سياسة الخصوصية. وعلى البائع أن يكون لديه أساس مشروع لجمع بيانات العملاء، وأن يعرض على عملائه معلومات الخصوصية الخاصة به، وألا يستخدم البيانات إلا لخدمة طلباتهم. وتعالج كويك برنت البيانات بحسب تعليمات البائع، وتحافظ على أمنها، وتستخدم المعالِجين الفرعيين المذكورين في سياسة الخصوصية، وتساعد البائع في الاستجابة لطلبات العملاء. [على المحامي إضافة شروط تفصيلية لمعالجة البيانات.]"] },
        { h: "10. الإيقاف والإنهاء", p: [
          "يجوز لنا إيقاف التحويلات أو الطلبات أو الحساب كاملًا فورًا عند وجود خطر احتيال أو مخالفة للقانون أو ضرر، أو نمط من المطالبات المرتدّة أو الشكاوى، أو فشل التوثيق أو انتهائه، أو طلب قانوني، وفيما عدا ذلك بإشعار معقول. ويجوز لأي من الطرفين إنهاء الاتفاقية بإشعار. وعند الإنهاء يظل البائع مسؤولًا عن الطلبات المفتوحة والاستردادات والمطالبات المرتدّة، وندفع له الرصيد المستحق بعد خصم ما عليه، وذلك بعد انقضاء فترة احتجاز الاستردادات والمطالبات المرتدّة.",
        ] },
        { h: "11. المسؤولية", p: [
          "يتحمل كل طرف مسؤولية الخسارة التي يسببها بإخلاله بهذه الاتفاقية، ولكن، بالقدر الذي يجيزه القانون، لا تتحمل كويك برنت الخسائر غير المباشرة أو فوات الربح أو الأعمال أو تأخر بوابات الدفع والبنوك والأطراف الثالثة، وتقتصر مسؤوليتها الإجمالية على الرسوم التي دفعها البائع خلال [12] شهرًا قبل المطالبة. ويعوّض البائع كويك برنت عن المطالبات والغرامات والتكاليف الناشئة عن سلعه ومحتواه والتزامه الضريبي والقانوني. [على المحامي تأكيد هذه الحدود.]",
        ] },
        { h: "12. أحكام عامة", p: [
          "يجوز لنا تحديث هذه الاتفاقية بإشعار (انظر الإصدار والتاريخ أعلاه). وتخضع هذه الاتفاقية لـ [القانون الواجب التطبيق] وتختص بها محاكم [جهة الاختصاص / المحاكم]. للتواصل: [البريد الإلكتروني للدعم]. العنوان المسجّل: [العنوان المسجّل].",
        ] },
      ],
    },
  },
};

/** Both languages, keyed by locale. */
export const LEGAL_COPY: Record<TrialLocale, LegalCopy> = { en, ar };

const mapStrings = <T,>(v: T, f: (s: string) => string): T => {
  if (typeof v === "string") return f(v) as unknown as T;
  if (Array.isArray(v)) return v.map((x) => mapStrings(x, f)) as unknown as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapStrings(x, f)])) as T;
  return v;
};

const memo = new Map<string, LegalCopy>();
/** Legal copy with `{trialDays}` filled (same wording rules as the rest of the marketing copy). */
export function getLegalCopy(locale: TrialLocale, trialDays: number): LegalCopy {
  const key = `${locale}:${trialDays}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const out = mapStrings(LEGAL_COPY[locale], (s) => fillTrialString(s, trialDays, locale));
  memo.set(key, out);
  return out;
}

export { LEGAL_KEYS };
