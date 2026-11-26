/**
 * English marketing copy. Single typed dictionary: `Copy` (the type of this object) is what src/lib/i18n/ar.ts must satisfy,
 * so a missing or extra key in either language fails the type check. Strings that need a value use {name} placeholders (see `fill`).
 */
export const en = {
  locale: "en" as "en" | "ar",
  common: {
    aed: "AED",
    example: "Example",
    homeAria: "QuickPrint uae.com home",
    poweredBy: "Powered by",
    seeLiveStore: "See a live store",
    startFree2: "Start free in 2 minutes",
    freeNote: "14 days free. No card needed.",
  },
  nav: {
    features: "Features", solutions: "Solutions", pricing: "Pricing", faq: "FAQ", demo: "Live demo", liveStores: "Live stores",
    signIn: "Sign in", startFree: "Start free", openMenu: "Open menu", closeMenu: "Close menu", mainAria: "Main", mobileAria: "Mobile",
    printShops: "Online ordering for print shops", walkIn: "Walk-in QR print queue", whatsapp: "WhatsApp AI ordering",
  },
  footer: {
    tagline: "Online storefront, order queue and invoicing for print shops in the UAE.",
    note: "AED · excl. 5% VAT",
    product: "Product", solutions: "Solutions", start: "Start",
    liveDemo: "Live demo store", startTrial: "Start free for 14 days",
    copyright: "© {year} QuickPrint UAE",
  },
  home: {
    meta: {
      title: "QuickPrint — Online printing platform for UAE print shops",
      description: "Launch your UAE print shop online in minutes: documents, photos, business cards, WhatsApp AI orders, walk-in QR queue, VAT invoices, Mamo Pay and Stripe.",
    },
    hero: {
      label: "Online print shop software · UAE",
      title1: "Take print orders online and ", title2: "get paid before you print.",
      body: "Open a branded storefront for your shop in about five minutes. Customers upload files, see an exact price in AED, pay by card or Apple Pay, then pick up or book delivery.",
      facts: ["Prices in AED", "5% VAT built in", "TRN on every tax invoice"],
    },
    ticket: {
      order: "Order", paid: "Paid", printingOn: "Printing on Front counter PC", flow: "Paid, Printing, Ready",
      items: [
        { name: "Business cards", spec: "500 pcs · 85 × 55 mm · soft-touch, gold foil", price: "270.00" },
        { name: "Passport photos", spec: "UAE 43 × 55 mm · 2 sets of 6", price: "50.00" },
        { name: "Document", spec: "42 pages · A4 colour · spiral bound", price: "62.50" },
      ],
      delivery: "Delivery, Tue 14:00 to 16:00", vat: "VAT 5%", total: "Total",
    },
    showcase: {
      heading: "See how an order moves through your shop",
      lead: "The same system covers your online store, your counter and your WhatsApp inbox.",
      tourAria: "Product tour",
      learnMore: "Learn more",
      tabs: {
        store: { label: "Storefront", title: "Customers see the price before they pay", points: ["They pick size, paper and quantity. The price updates as they choose.", "They upload files, and page counts are read from the PDF.", "They pay online, then choose pickup or a delivery slot."] },
        walkin: { label: "Walk-in queue", title: "Clear the counter queue", points: ["Show a QR code at the counter.", "Customers upload documents and pay on their phone.", "Paid jobs reach your printer in priority order, shortest first."] },
        whatsapp: { label: "WhatsApp AI", title: "Answer WhatsApp orders at any hour", points: ["Connect the number you already use. You keep the WhatsApp Business app.", "The AI quotes with your own prices and builds a cart.", "Reply from your phone and the AI steps aside."] },
        admin: { label: "Admin", title: "See the whole shop at a glance", points: ["Orders, print queue and revenue sit on one screen.", "Move jobs from paid to printing to ready.", "Download a tax invoice with your TRN in one click."] },
      },
      store: {
        title: "yourshop.quickprint.ae / flyers", name: "Flyers and leaflets", ready: "Ready in about 2 days",
        size: "Size", sizes: ["A6 105 × 148 mm", "A5 148 × 210 mm", "A4 210 × 297 mm"],
        paper: "Paper", papers: ["130 gsm gloss", "150 gsm gloss", "170 gsm matte"],
        qty: "Quantity", yourPrice: "Your price", vat: "plus AED 15.00 VAT (5%)", add: "Add to cart",
      },
      queue: {
        title: "Walk-in queue", scan: "Scan to print",
        rows: [
          { t: "W-014", n: "Aisha", f: "report.pdf · 12 pp", s: "Printing now" },
          { t: "W-016", n: "Omar", f: "form.pdf · 1 p", s: "High, next" },
          { t: "W-015", n: "Sara", f: "thesis.pdf · 148 pp", s: "Waiting" },
          { t: "W-017", n: "Khalid", f: "id-copy.jpg · 1 p", s: "Awaiting payment" },
        ],
      },
      chat: {
        title: "WhatsApp · +971 50 123 4567", customer: "500 business cards and 100 flyers", cart: "Your cart",
        l1: "1. 500 business cards, 350 gsm: AED 120.00", l2: "2. 100 flyers, A5 150 gsm: AED 120.00",
        vat: "VAT 5%: AED 12.00", total: "Total AED 252.00", checkout: "Open checkout to upload files and pay", confirm: "Confirm cart", person: "Talk to a person",
      },
      admin: {
        title: "Dashboard · today", waiting: "Waiting", printing: "Printing", printed: "Printed",
        revenue: "Paid orders, last 14 days", spark: "Paid orders rose over the last 14 days",
        o1: "QP-10482 · Business cards", o2: "QP-10481 · Photo prints", ready: "Ready",
      },
    },
    bento: {
      heading: "Everything a UAE print counter needs",
      lead: "Prices, payments, delivery, invoices and queues in one place, set up for the UAE from day one.",
      pay: { title: "Paid before it reaches you", text: "Card, Apple Pay and Google Pay go to your own Stripe or Mamo Pay account. There is no cash on delivery." },
      quote: { title: "Quotes follow your price list", text: "Set prices by size, paper, sides and quantity. Customers get the exact figure.", caption: "Example quantity tiers for business cards", head: "Business cards, 350 gsm", each: "Each", pcs: "pcs" },
      cards: { title: "Customers design their own cards", text: "They type name, title and phone and get three print-ready layouts in seconds.", name: "Aisha Al Mansoori", role: "Managing Director", size: "85 × 55 mm" },
      qr: { title: "A QR code for the busy counter", text: "Customers scan, upload documents, pay on their phone and take a ticket. Paid jobs print automatically, shortest first. Each walk-in is saved by phone number.", steps: ["Scan and upload", "Pay on the phone", "Prints in priority order"] },
      wa: { title: "WhatsApp orders, quoted by AI", text: "Connect the number you already use. The AI builds the cart with your prices and sends one checkout link. You take over by replying from your phone.", q: "Can I get 500 business cards?", a: "500 cards: AED 126.00 with VAT. Checkout link below." },
      vat: { title: "5% VAT and your TRN on every invoice", text: "Choose prices with VAT included or added at checkout. Download a tax invoice for any order." },
      delivery: { title: "Pickup, your drivers or a courier", text: "Jeebly, Quiqup, Careem Box and Aramex connect with your own account. Fees and lead times are set per emirate.", badges: ["Pickup", "Own drivers", "Courier"] },
      offers: { title: "Run offers on your home page", text: "Upload banners, set start and end dates and reorder them. Live offers slide across the top of your store." },
      demo: "Want to see it in use? ", demoLink: "Open the demo store",
    },
    how: {
      heading: "Live in three steps", step: "Step",
      steps: [
        { title: "Sign up and check your prices", text: "Your storefront opens with UAE sizes and typical prices already in place. Change any of them in the dashboard." },
        { title: "Share your store link", text: "Send it on WhatsApp, add it to Instagram, or print the QR code for your counter." },
        { title: "Print and hand over", text: "Paid orders appear in your queue. Mark them ready and your customers get the update." },
      ],
    },
    trust: {
      heading: "Made for UAE print counters",
      facts: [
        { value: 5, suffix: "%", text: "", label: "VAT on every order, added or included as you choose" },
        { value: 0, suffix: "", text: "TRN", label: "printed on every tax invoice, ready for your FTA records" },
        { value: 7, suffix: "", text: "", label: "emirates, each with its own delivery fee and lead time" },
        { value: 14, suffix: "", text: "", label: "days free on every plan, with no card needed" },
      ],
      specsAria: "Print specifications supported",
      specs: ["A5 · A4 · A3", "80 · 150 · 350 gsm", "85 × 55 mm cards", "UAE passport 43 × 55 mm", "AED · 5% VAT", "Pickup and delivery"],
    },
    pricing: {
      heading: "Simple pricing in AED",
      lead: "Pick a monthly subscription, or pay a percentage only when orders are paid. Prices exclude 5% VAT. Your payment provider charges its own fees.",
      updating: "Plans are being updated. ", trial: "Start a free trial", to: " to see them.",
      explainer: "Subscription or pay per order?", compare: "Compare every plan",
    },
    faqHeading: "Questions shop owners ask",
    faq: [
      { q: "Do I need a website to start?", a: "No. Your storefront is ready when you sign up, with common UAE products and prices already loaded. You can change every product, option and price later." },
      { q: "How do customers pay me?", a: "You connect your own Stripe or Mamo Pay account. Customers pay at checkout and the money goes to you. QuickPrint bills you separately, either a monthly subscription or a percentage of paid orders, depending on the plan you choose." },
      { q: "Why is there no cash on delivery?", a: "Cash on delivery leads to unpaid prints, failed deliveries and cash to count. Every order on QuickPrint is paid online first, so a job only reaches your printer once the money is in." },
      { q: "Which delivery options can I offer?", a: "You can offer pickup, delivery by your own drivers, or couriers such as Jeebly, Quiqup, Careem Box and Aramex. Courier connections need your own account with that courier. You set fees and lead times for each emirate." },
      { q: "What is the walk-in QR queue?", a: "It is a QR code for your counter. A customer scans it, uploads documents, pays on their phone and gets a ticket. Paid jobs go to your printer in priority order, and short jobs go first." },
      { q: "Can I take orders on WhatsApp?", a: "Yes. You connect the WhatsApp Business number you already use and keep the WhatsApp Business app. The AI answers with your own prices, builds a cart and sends a checkout link. You can take over any chat by replying from your phone." },
      { q: "Is it safe for confidential documents and ID photos?", a: "Confidential files are encrypted when stored, only your team can open them, every download is logged, and files are deleted automatically after the order is complete." },
      { q: "Subscription or pay per order: which should I pick?", a: "A subscription is a fixed monthly fee with no charge on your orders, so it suits shops with steady sales. Pay per order has no monthly fee and takes a small percentage of each paid order (shown on the pricing page), so it suits new shops and quiet months. You can switch later. WhatsApp messages and AI features are billed by use on top of either plan, after any free allowance." },
      { q: "What happens when the free trial ends?", a: "You choose a plan and pay your first invoice. If you do not, your storefront is paused after a grace period and your data is kept. You can cancel a monthly plan at any time." },
    ],
    final: { heading: "Put your counter online this week", text: "Sign up, check your prices and share your link. Most shops take orders the same day.", pricing: "See pricing" },
  },
  priceTable: {
    periodAria: "Billing period", monthly: "Monthly", yearly: "Yearly", saves: "Yearly saves about 2 months", popular: "Most popular",
    perMonth: "/month", billedYear: "Billed {amount} a year", billedMonth: "Billed monthly", noFee: "No fee on orders. Excludes VAT.",
    startTrial: "Start 14 days free", otherWay: "Other way to pay", paygLine: "a month, then {pct}% of each paid order",
    paygBody: "No monthly fee. You pay only when a customer pays you. Best for a new shop or a quiet season. Excludes VAT.", paygCta: "Start with pay per order",
    // display-only translations of plan data that lives in the database (empty for English)
    everythingIn: "Everything in {plan}",
    planNames: {} as Record<string, string>,
    features: {} as Record<string, string>,
  },
  billing: {
    subscription: { title: "Subscription", text: "A fixed monthly fee. We take nothing from your orders. Choose this when you take steady orders and want a predictable bill.", example: "Example: 60 orders worth AED 18,000 on Growth costs AED 499, whatever the order value." },
    payg: { title: "Pay per order", text: "No monthly fee. We take {pct}% of each paid order. Refunded and unpaid orders do not count. Choose this to start small or when orders vary a lot.", example: "Example: AED 18,000 of paid orders costs AED {big}. A quiet month with AED 2,000 costs AED {small}." },
    usage: { title: "Usage, on top of both", text: "WhatsApp messages and AI features are billed by use after any free allowance in your plan. Print orders, storage and your own staff are not metered.", none: "Current rates are shown in your billing page before you use any metered feature.", per: "per" },
    kinds: {} as Record<string, { label: string; unit: string }>,
  },
  compare: {
    caption: "Compare QuickPrint plans", plan: "Plan", included: "Included", notIncluded: "Not included", none: "None", unlimited: "Unlimited",
    monthly: "Monthly price", yearly: "Yearly price", fee: "Fee on paid orders", orders: "Orders per month", team: "Team members",
  },
  storesPage: {
    meta: {
      title: "Live print shops in the UAE: find a shop near you",
      description: "Browse live print shops on QuickPrint UAE by emirate and area, then order documents, photos and business cards online for pickup or delivery.",
    },
    label: "Live stores · UAE", h1: "Find a print shop near you",
    lead: "Every shop here is open for online orders. Pick your emirate and area, open the store and order in minutes.",
    emirateLabel: "Emirate", areaLabel: "Area", allEmirates: "All emirates", allAreas: "All areas", searchLabel: "Search shops", searchPlaceholder: "Shop name or street", apply: "Show shops", clear: "Clear filters",
    countOne: "{n} shop", countMany: "{n} shops", openStore: "Open store", whatsapp: "WhatsApp", call: "Call", hours: "Hours",
    emptyH: "No shops here yet", emptyLead: "Try another area, or tell your local print shop they can take online orders with QuickPrint.",
    ownerH: "Own a print shop?", ownerLead: "List your shop here for free with your 14-day trial, and let nearby customers find you.", ownerCta: "Start free",
    emirates: { "Abu Dhabi": "Abu Dhabi", Dubai: "Dubai", Sharjah: "Sharjah", Ajman: "Ajman", "Umm Al Quwain": "Umm Al Quwain", "Ras Al Khaimah": "Ras Al Khaimah", Fujairah: "Fujairah" } as Record<string, string>,
  },
  pricingPage: {
    meta: {
      title: "Pricing in AED: subscription or pay per order",
      description: "QuickPrint UAE plans for print shops: a monthly subscription with no fee on orders, or pay per order with no monthly fee. WhatsApp and AI are pay as you go.",
    },
    label: "Pricing · AED · excl. 5% VAT", h1: "Pricing for print shops of every size",
    lead: "Pay a fixed monthly fee, or pay a percentage only when an order is paid. Every plan starts with 14 days free.",
    updating: "Plans are being updated. Please check back shortly.",
    billingH: "How you are billed", billingLead: "Two ways to pay for the platform, and usage that is billed on top of both.", compareH: "Compare plans",
    faqHeading: "Billing questions",
    faq: [
      { q: "Is there a free trial?", a: "Yes. Every plan starts with 14 days free and no card. You can switch plans during the trial." },
      { q: "Do prices include VAT?", a: "No. Prices are in AED and exclude 5% VAT. VAT is added to your invoice, and each invoice shows your subscription, any order fee and any usage." },
      { q: "When does the order fee apply?", a: "Only on the Pay per order plan. It is a percentage of paid orders in the month, billed with your invoice. Refunded and unpaid orders do not count. Subscription plans never charge a fee on orders." },
      { q: "What is billed by usage?", a: "WhatsApp messages sent through the Meta API and AI features, such as chat replies and card designs. Some plans include a free allowance each month. Anything above it is billed at the rate on your billing page." },
      { q: "Can I change plans?", a: "Yes. During the trial a change applies at once. On a paid plan a change starts at the next billing month, and you can cancel a scheduled change before then." },
      { q: "Do payment provider fees come out of this?", a: "No. Stripe and Mamo Pay charge their own fees. Customers pay into your own account." },
    ],
  },
  signup: {
    meta: { title: "Start your free trial", description: "Create your QuickPrint print shop store in about two minutes. 14 days free on every plan, no card needed. Prices in AED, excluding 5% VAT." },
    headline: "Your print shop, open online 24/7.",
    bullets: ["Storefront loaded with documents, photos, passport photos, cards, flyers and more", "Prepaid orders through your own Stripe or Mamo Pay", "Pickup and scheduled delivery across all 7 emirates", "14 days free, no card required"],
    haveAccount: "Already have an account? ", signIn: "Sign in",
    createH: "Create your print shop", sub: "Two short sections. About 2 minutes.",
    form: {
      progress: "Progress", step1: "Your shop", step2: "You and your plan", shopName: "Shop name", storeAddress: "Store address", slugAria: "Store slug",
      slugHint: "Letters, numbers and dashes. You can add your own domain later.", available: "✓ Available", emirate: "Emirate", ownerName: "Your name", mobile: "Mobile",
      email: "Work email", password: "Password", passwordHint: "(at least 8 characters)", plan: "Plan",
      planPayg: "{name}: AED 0 a month, {pct}% per paid order", planSub: "{name}: AED {price} a month",
      note: "Free for 14 days. No card needed. You can change plan any time.", submit: "Create my shop, free for 14 days", loading: "Setting up your shop…",
      terms: "By creating a shop you agree to the Terms and Privacy Policy.", failed: "Signup failed",
      emirates: {} as Record<string, string>,
    },
  },
  solutions: {
    related: "More ways QuickPrint helps", whatYouGet: "What you get", howItWorks: "How it works", faq: "Common questions", step: "Step",
    ctaStart: "Start free for 14 days", ctaPricing: "See pricing", ctaDemo: "See a live store", home: "Home", solutions: "Solutions",
    pages: {
      "print-shops": {
        meta: { title: "Online ordering for print shops in the UAE", description: "Give your UAE print shop a branded online store: exact AED prices, files uploaded, paid before you print, pickup or scheduled delivery, and VAT invoices." },
        label: "For print shops · UAE", h1: "Online ordering for print shops in the UAE",
        lead: "QuickPrint gives your shop a branded storefront. Customers choose size, paper and quantity, see an exact price in AED, upload their files and pay before you print.",
        panel: "store",
        benefits: [
          { title: "Exact prices from your price list", text: "Set prices by size, paper, sides and quantity. Customers see the exact figure, with 5% VAT added or included as you choose." },
          { title: "Paid before it reaches you", text: "Card, Apple Pay and Google Pay go to your own Stripe or Mamo Pay account. There is no cash on delivery, so no unpaid prints." },
          { title: "A UAE catalogue on day one", text: "Your storefront opens with common UAE products and prices already loaded: documents, photos, passport photos, business cards, flyers and more. Change anything later." },
          { title: "Pickup, your drivers or a courier", text: "Offer pickup, delivery by your own drivers, or couriers such as Jeebly, Quiqup, Careem Box and Aramex. Fees and lead times are set per emirate." },
          { title: "Tax invoices with your TRN", text: "Download a VAT tax invoice for any order, with your Tax Registration Number on it." },
          { title: "Offers on your home page", text: "Upload banners, set start and end dates and reorder them. Live offers slide across the top of your store." },
        ],
        steps: [
          { title: "Sign up and check your prices", text: "Review the products and prices already in your storefront and edit what you need." },
          { title: "Connect payments and delivery", text: "Add your Stripe or Mamo Pay account and set pickup and delivery for each emirate." },
          { title: "Share your link", text: "Send it on WhatsApp, add it to Instagram, or print the QR code for your counter." },
        ],
        faq: [0, 1, 3, 2],
        extraFaq: [],
        related: ["walk-in-queue", "whatsapp-ordering"],
      },
      "walk-in-queue": {
        meta: { title: "Walk-in QR print queue for print shops", description: "Show a QR code at your counter. Customers scan, upload documents and pay on their phone, and paid jobs print in priority order, shortest first." },
        label: "Walk-in queue · UAE print counters", h1: "A walk-in QR print queue for your counter",
        lead: "Show a QR code at the counter. Customers scan it, upload documents, pay on their phone and take a ticket. Paid jobs go to your printer in priority order.",
        panel: "queue",
        benefits: [
          { title: "Customers do the typing", text: "They scan the QR code, upload their documents and pay on their own phone, so there is less to do at the counter." },
          { title: "Paid before it prints", text: "Each job is paid online first. A job only reaches your printer once the money is in." },
          { title: "Priority order, shortest first", text: "Paid jobs join a priority queue and short jobs go first, so a one-page form does not wait behind a 148-page thesis." },
          { title: "Prints on its own", text: "Paid jobs are sent to your shop's printer automatically through a small print agent." },
          { title: "Walk-ins are remembered", text: "Each walk-in customer is saved by phone number." },
          { title: "Private files stay private", text: "Confidential files are encrypted when stored, every download is logged, and files are deleted automatically after the order is complete." },
        ],
        steps: [
          { title: "Put the QR code at your counter", text: "Print the QR poster from your dashboard and place it where customers queue." },
          { title: "Customers scan, upload and pay", text: "They upload documents and pay on their phone, then get a ticket." },
          { title: "Paid jobs print in order", text: "Your queue shows each ticket and its status, such as waiting or printing." },
        ],
        faq: [4, 6],
        extraFaq: [
          { q: "Which files can walk-in customers upload?", a: "Documents. The walk-in queue is built for document printing. Other products are ordered through your storefront." },
          { q: "Do I need special software?", a: "Paid jobs reach your printer through a small print agent that runs on your shop computer." },
        ],
        related: ["print-shops", "whatsapp-ordering"],
      },
      "whatsapp-ordering": {
        meta: { title: "WhatsApp AI ordering for print shops", description: "Connect your WhatsApp Business number. The AI quotes with your prices, builds a cart and sends a checkout link. You can take over any chat from your phone." },
        label: "WhatsApp AI ordering · UAE", h1: "Take print orders on WhatsApp with AI",
        lead: "Connect the WhatsApp Business number you already use. The AI answers with your own prices, builds a cart from the chat and sends one checkout link.",
        panel: "chat",
        benefits: [
          { title: "Keep your number and your app", text: "You connect the WhatsApp Business number you already use and keep the WhatsApp Business app on your phone." },
          { title: "Quotes from your own prices", text: "The AI answers with the prices in your price list, so customers get the same figure they would see in your store." },
          { title: "A cart built from the chat", text: "The AI builds the cart from what the customer asks for and sends a prefilled checkout link." },
          { title: "Paid online, as always", text: "Customers open the checkout link to upload files and pay. Orders are paid before they reach your printer." },
          { title: "You can take over any time", text: "Reply from your phone and the AI steps aside." },
          { title: "Answers at any hour", text: "Customers get a reply even when the shop is closed." },
        ],
        steps: [
          { title: "Connect your WhatsApp Business number", text: "Link the number you already use. You keep using the WhatsApp Business app." },
          { title: "The AI quotes and builds the cart", text: "It replies with your prices and sends one checkout link." },
          { title: "The customer pays, you print", text: "The paid order appears in your queue like any other order." },
        ],
        faq: [5, 6],
        extraFaq: [
          { q: "Who pays for WhatsApp messages and AI replies?", a: "They are billed by use on top of your plan, after any free allowance included in it. Current rates are on your billing page. Orders, storage and your staff are not metered." },
        ],
        related: ["print-shops", "walk-in-queue"],
      },
    } as Record<string, SolutionCopy>,
  },
};

export interface SolutionCopy {
  meta: { title: string; description: string };
  label: string; h1: string; lead: string;
  panel: "store" | "queue" | "chat";
  benefits: { title: string; text: string }[];
  steps: { title: string; text: string }[];
  /** indices into home.faq to reuse */
  faq: number[];
  extraFaq: { q: string; a: string }[];
  related: string[];
}

export type Copy = typeof en;
