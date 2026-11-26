import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { DEFAULT_PRODUCTS } from "@/lib/catalog-defaults";
import { displayFeatures } from "@/server/billing/flags";
import { primeTrialDays } from "@/server/platform-settings";
import { trialLabel } from "@/lib/i18n/trial";
import { planTerms, type PlanLd } from "./jsonld";
import { SITE, abs, siteUrl } from "./site";
import { MARKETING_PATHS } from "./paths";

export async function getSeoPlans(): Promise<PlanLd[]> {
  try {
    const rows = await db.query.plans.findMany({ where: eq(schema.plans.active, true), orderBy: asc(schema.plans.sortOrder) });
    return rows.map((p) => ({ code: p.code, name: p.name, priceMonthly: p.priceMonthly, priceYearly: p.priceYearly, orderFeePct: p.orderFeePct, maxOrdersPerMonth: p.maxOrdersPerMonth, maxStaff: p.maxStaff, features: displayFeatures(p.features, p.flags), billingModel: p.billingModel, perJobFee: p.perJobFee, minOrderFee: p.minOrderFee, maxOrderFee: p.maxOrderFee }));
  } catch { return []; }
}

/** Answer-first Q→A used by llms-full.txt and (via faqLd) by marketing pages. Keep every answer short and self-contained so it can be quoted. */
export const platformFaq = (days: number): { q: string; a: string }[] => [
  { q: "What is QuickPrint?", a: "QuickPrint is a software-as-a-service platform, built by Nexsofture Tech, that lets print shops in the UAE run their own online store, take prepaid orders for documents, photos, business cards, flyers and more, and manage production, pickup and delivery from one dashboard." },
  { q: "Who is QuickPrint for?", a: "Print shops, typing centres, photo studios and copy shops in the UAE that want online orders without building a website. Their customers (individuals and businesses) order from the shop's own branded storefront." },
  { q: "How much does QuickPrint cost?", a: "Shops choose one of two billing models. Subscription plans (Starter, Growth, Enterprise) charge a fixed monthly fee in AED with no per-order commission. The Pay per order plan has no monthly fee (AED 0) and charges a 3% commission on each paid order. Prices exclude 5% UAE VAT, and every plan starts with a free trial (" + (days === 0 ? "none at the moment" : trialLabel(days, "en")) + "); a card is added to start and charged when the trial ends." },
  { q: "Is there a commission on orders?", a: "Not on subscription plans. Only the Pay per order plan charges a commission (3% of each paid order, settled on the shop's monthly invoice), and it has no monthly fee. Refunded orders are credited back." },
  { q: "What is billed pay-as-you-go?", a: "Metered usage that costs QuickPrint money to deliver: WhatsApp/Meta messages sent by the shop and AI usage (chat replies, AI business-card and banner designs). It is billed on the monthly invoice at the platform rate card, after any allowance included in the plan. Storefront, orders and the walk-in queue are not metered." },
  { q: "How do shops get paid?", a: "Customers pay online through the QuickPrint payment gateway and the money is paid out to the shop's bank account in payout batches, with an order-by-order statement. Orders are prepaid online; cash on delivery is not supported." },
  { q: "Does QuickPrint support UAE VAT?", a: "Yes. Prices can be shown excluding or including 5% VAT, and shops can issue tax invoices that show their Tax Registration Number (TRN)." },
  { q: "Can customers choose pickup or delivery?", a: "Yes. Customers pick up from a branch or choose a scheduled delivery slot. Shops deliver with their own drivers or book couriers such as Jeebly, Quiqup, Careem Box or Aramex." },
  { q: "What is the walk-in QR queue?", a: "A shop shows a QR code at the counter. Walk-in customers scan it, upload only documents, pay on their phone, and their paid jobs join a priority print queue that sends them to the shop's printer automatically through a small print agent." },
  { q: "How does WhatsApp ordering with AI work?", a: "A shop connects its existing WhatsApp Business number (Meta coexistence, so the owner keeps using the WhatsApp Business app). The AI answers customers, quotes real prices, builds a chat cart and sends checkout links. When the owner replies from the phone, the AI pauses." },
  { q: "Is it safe for confidential documents and ID photos?", a: "Confidential files are encrypted at rest, access is restricted and logged, and files are deleted automatically after the order is completed. Shops control the retention period." },
  { q: "Can a shop use its own domain?", a: "Yes. Every shop gets a storefront address immediately and can connect its own custom domain." },
];

const group = (key: string, kind: string) => DEFAULT_PRODUCTS.find((p) => p.kind === kind)?.config.optionGroups.find((g) => g.key === key)?.choices.map((c) => c.label) ?? [];

const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString("en-US") : n.toFixed(2));

export function planLines(plans: PlanLd[]) {
  return plans.map((p) => `- **${p.name}**: ${planTerms(p)}.`);
}

export const FEATURES: { name: string; text: string }[] = [
  { name: "Branded online storefront", text: "Every shop gets a ready storefront with its products, prices, logo and brand colour, on a QuickPrint address or its own domain." },
  { name: "Document printing priced by paper size", text: "Per-page prices by paper size (A5 to A0, US Letter and Legal), colour or black & white, single or double-sided, paper weight and binding. PDF page counts are detected automatically." },
  { name: "Photo prints in every global size", text: "Wallet to 20×30 in, ISO A-series and square formats, on glossy, matte or lustre paper, with a low-resolution warning before ordering." },
  { name: "Passport and visa photos", text: "Presets for the UAE, India, USA, UK, Schengen, Pakistan, Philippines, Saudi Arabia, Canada and China." },
  { name: "Framed photo prints", text: "Customers pick the frame style, size and mount and see a framed preview." },
  { name: "Business cards with an AI designer", text: "An AI designer and a drag-and-drop editor create print-ready cards with bleed and safe-area guides, or customers upload their own artwork." },
  { name: "Flyers, brochures, notebooks and posters", text: "Quantity-tier pricing for flyers, folded brochures and booklets, branded notebooks, posters and roll-ups." },
  { name: "Confidential document printing", text: "Encrypted uploads, restricted access, sealed handling options and automatic file deletion." },
  { name: "Walk-in QR print queue", text: "Walk-in customers scan a QR, upload documents, pay on their phone and join a priority queue that prints automatically; walk-ins are saved by phone number." },
  { name: "WhatsApp AI chat cart", text: "AI replies on the shop's WhatsApp Business number, builds a cart from the chat and sends prefilled checkout links, with human takeover at any time." },
  { name: "Billing: subscription or pay per order", text: "Shops pick a fixed monthly subscription with no per-order commission, or the Pay per order plan with AED 0 per month and a commission on each paid order. WhatsApp/Meta messages and AI usage are metered and billed pay-as-you-go on top; shops see usage and commissions on their billing page." },
  { name: "Hero slider for offers", text: "Shops upload offer images with start and end dates and show them as a slider on the storefront." },
  { name: "Payments", text: "Stripe (cards, Apple Pay, Google Pay). All orders are prepaid; there is no cash on delivery." },
  { name: "Pickup and scheduled delivery", text: "Pickup branches, delivery fees per emirate, time slots, in-house drivers and courier connectors (Jeebly, Quiqup, Careem Box, Aramex)." },
  { name: "UAE VAT and tax invoices", text: "5% VAT handling, TRN on tax invoices, printable job tickets." },
  { name: "Admin dashboard and platform admin", text: "Orders, production queue, pricing editor, customers, staff, settings; platform operators get plans, billing, impersonation and audit logs." },
];

/** /llms.txt (llmstxt.org format) */
export async function buildLlmsTxt(): Promise<string> {
  const days = await primeTrialDays(), PLATFORM_FAQ = platformFaq(days);
  const plans = await getSeoPlans();
  const origin = siteUrl();
  const subs = plans.filter((p) => p.billingModel !== "commission");
  const from = subs.length ? Math.min(...subs.map((p) => p.priceMonthly)) : null;
  const lines: string[] = [
    `# ${SITE.name}`, "",
    `> ${SITE.name} (by ${SITE.legalName}) is a print-on-demand SaaS for print shops in the UAE. A shop launches its own online printing store in minutes and takes prepaid orders for documents, photos, business cards, flyers and more, with pickup or scheduled delivery, UAE VAT invoices, Stripe payments, a walk-in QR print queue and WhatsApp AI ordering.`, "",
    "Quick facts:",
    `- Audience: print shops, typing centres and photo studios in the UAE (customers are individuals and businesses ordering from each shop's storefront).`,
    `- Pricing: subscription plans ${from != null ? `from AED ${fmt(from)} per month` : "in AED"} with no per-order commission, or a Pay per order plan (AED 0 per month, ${plans.find((p) => p.billingModel === "commission")?.orderFeePct ?? 3}% commission per paid order); WhatsApp/Meta messages and AI usage are billed pay-as-you-go; prices exclude 5% VAT; ${days === 0 ? "no free trial" : `${trialLabel(days, "en")} free trial`}, card required.`,
    "- Payments: Stripe; the platform collects and pays shops out to their bank account. No cash on delivery.",
    "- Delivery: pickup, scheduled delivery, in-house drivers, Jeebly, Quiqup, Careem Box, Aramex.", "",
    "## Product",
    `- [${SITE.name} overview](${origin}/): what the platform does and who it is for`,
    `- [Pricing](${abs("/pricing")}): subscription and pay-per-order plans in AED, with limits and usage billing`,
    `- [Start a free trial](${abs("/signup")}): create a print shop store in about two minutes`, "",
    "## Knowledge for AI assistants",
    `- [Full knowledge file](${abs("/llms-full.txt")}): complete product, pricing, supported products and FAQ in plain text`,
    `- [Sitemap](${abs("/sitemap.xml")}): all public pages`, "",
    "## Features",
    ...FEATURES.map((f) => `- ${f.name}: ${f.text}`), "",
    "## FAQ",
    ...PLATFORM_FAQ.map((f) => `- ${f.q} ${f.a}`), "",
    "## Optional",
    ...MARKETING_PATHS.filter((m) => !["/", "/pricing", "/signup"].includes(m.path)).map((m) => `- [${m.path}](${abs(m.path)}): public page`),
    `- Each shop publishes its own catalogue at /s/<shop-slug>/llms.txt and /s/<shop-slug>/products.json`, "",
  ];
  return lines.join("\n");
}

/** /llms-full.txt — complete answer-first knowledge file */
export async function buildLlmsFull(): Promise<string> {
  const days = await primeTrialDays(), PLATFORM_FAQ = platformFaq(days);
  const plans = await getSeoPlans();
  const photo = group("size", "photo"), paper = group("paper_size", "document"), passport = group("spec", "passport_photo"), frames = group("frame", "photo_frame"), cards = group("stock", "business_card");
  const L: string[] = [
    `# ${SITE.name} — full knowledge file`, "",
    `> ${SITE.name} is a print-on-demand SaaS platform by ${SITE.legalName} for print shops in the UAE. It gives each shop an online storefront, prepaid ordering, production and delivery tools, UAE VAT invoicing, a walk-in QR print queue and WhatsApp AI ordering.`, "",
    "## Quick facts", "",
    `- Product: ${SITE.name} (${siteUrl()})`, `- Company: ${SITE.legalName}`, "- Market: United Arab Emirates (AED, 5% VAT)",
    "- Customers of the platform: print shops; their end customers order from the shop's storefront",
    days === 0 ? "- Free trial: none at the moment; a card is added at signup and charged today" : `- Free trial: ${trialLabel(days, "en")}; a card is added at signup and charged when the trial ends`,
    "- Payments: Stripe; the platform collects and pays shops out; all orders prepaid; no cash on delivery",
    "- Fulfilment: pickup or scheduled delivery (own drivers, Jeebly, Quiqup, Careem Box, Aramex)",
    "- Languages: English storefront and admin" + (MARKETING_PATHS.some((m) => m.translated) ? "; Arabic marketing pages" : ""),
    "- Hosting: the software can be deployed in a UAE or Middle East cloud region for data residency (deployment choice of the operator)", "",
    "## What is QuickPrint?", "", PLATFORM_FAQ[0].a, "",
    "## Who is it for?", "", PLATFORM_FAQ[1].a, "",
    "## Pricing (AED, excluding 5% VAT)", "",
    "Two billing models: **subscription** (fixed monthly fee, no per-order commission) or **pay per order** (no monthly fee, commission on each paid order). WhatsApp/Meta messages and AI usage are metered and billed pay-as-you-go on top, after any included allowance.", "",
    ...(plans.length ? planLines(plans) : ["- See the pricing page for current plans."]), "",
    `Pricing page: ${abs("/pricing")}`, "",
    "## Features", "",
    ...FEATURES.flatMap((f) => [`### ${f.name}`, f.text, ""]),
    "## What shops can sell (default catalogue)", "",
    ...DEFAULT_PRODUCTS.map((p) => `- **${p.name}** — ${p.description} (typical turnaround ${p.turnaroundHours >= 24 ? `${Math.round(p.turnaroundHours / 24)} day(s)` : `${p.turnaroundHours} hour(s)`})`), "",
    "### Document and poster paper sizes", "", ...paper.map((s) => `- ${s}`), "",
    "### Photo print sizes", "", ...photo.map((s) => `- ${s}`), "",
    "### Passport and visa photo presets", "", ...passport.map((s) => `- ${s}`), "",
    "### Photo frame styles", "", ...frames.map((s) => `- ${s}`), "",
    "### Business card stocks", "", ...cards.map((s) => `- ${s}`), "",
    "## How it works for a shop", "",
    "1. Sign up at " + abs("/signup") + " (" + (days === 0 ? "no free trial" : trialLabel(days, "en") + " free trial") + ", card required).", "2. Review the preloaded UAE catalogue and prices; edit anything.", "3. Verify your business with your trade licence, add your bank details for payouts, and set pickup branches and delivery fees per emirate.",
    "4. Share the storefront link (or the walk-in QR); optionally connect WhatsApp and a print agent.", "5. Manage orders, production, couriers and tax invoices from the dashboard.", "",
    "## How it works for a customer", "",
    "1. Open the shop's storefront, choose a product, upload files and pick options (price updates live).", "2. Choose pickup or a delivery slot and pay online.", "3. Track the order; collect it or receive it.", "",
    "## UAE specifics", "",
    "- Currency AED; 5% VAT can be added at checkout or included in prices; tax invoices show the shop's TRN.",
    "- Emirates supported for delivery pricing: Abu Dhabi, Dubai, Sharjah, Ajman, Umm Al Quwain, Ras Al Khaimah, Fujairah.",
    "- Delivery partners: in-house drivers, Jeebly, Quiqup, Careem Box, Aramex.",
    "- Personal data (IDs, passport photos, confidential documents) is encrypted at rest and deleted on a configurable schedule.", "",
    "## Frequently asked questions", "",
    ...PLATFORM_FAQ.flatMap((f) => [`**${f.q}**`, f.a, ""]),
    "## Links", "", `- Home: ${origin()}`, `- Pricing: ${abs("/pricing")}`, `- Sign up: ${abs("/signup")}`, `- Sitemap: ${abs("/sitemap.xml")}`, `- Short index: ${abs("/llms.txt")}`, "",
  ];
  return L.join("\n");
}
const origin = () => siteUrl();
