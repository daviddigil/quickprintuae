import type { ProductConfig, ProductKind, TenantSettings } from "./types";

export const DEFAULT_TENANT_SETTINGS: TenantSettings = {
  vatRate: 5,
  pricesIncludeVat: false,
  currency: "AED",
  confidentialRetentionHours: 72,
  orderPrefix: "QP",
  aiDesignerEnabled: true,
  payments: { stripe: { enabled: false }, mamo: { enabled: false, sandbox: true } },
  delivery: {
    enabled: true,
    pickupEnabled: true,
    slotMinutes: 120,
    openHour: 9,
    closeHour: 21,
    scheduleDaysAhead: 7,
    closedWeekdays: [5], // Friday
    defaultProvider: "inhouse",
    providers: { inhouse: { enabled: true } },
  },
  heroTitle: "Print anything. Pick up or get it delivered.",
  heroSubtitle: "Documents, photos, business cards, flyers and more — printed today across the UAE.",
};

/* ---------- reusable option groups ---------- */
const PAPER_SIZES = {
  key: "paper_size", label: "Paper size", type: "select" as const, required: true, default: "A4",
  choices: [
    { value: "A5", label: "A5 (148 × 210 mm)", multiplier: 0.8, widthMm: 148, heightMm: 210 },
    { value: "A4", label: "A4 (210 × 297 mm)", widthMm: 210, heightMm: 297 },
    { value: "Letter", label: "US Letter (216 × 279 mm)", widthMm: 216, heightMm: 279 },
    { value: "Legal", label: "US Legal (216 × 356 mm)", multiplier: 1.3, widthMm: 216, heightMm: 356 },
    { value: "A3", label: "A3 (297 × 420 mm)", multiplier: 2, widthMm: 297, heightMm: 420 },
    { value: "A2", label: "A2 (420 × 594 mm)", multiplier: 6, widthMm: 420, heightMm: 594 },
    { value: "A1", label: "A1 (594 × 841 mm)", multiplier: 12, widthMm: 594, heightMm: 841 },
    { value: "A0", label: "A0 (841 × 1189 mm)", multiplier: 22, widthMm: 841, heightMm: 1189 },
  ],
};
const COLOR_MODE = {
  key: "color", label: "Colour", type: "radio" as const, required: true, default: "bw",
  choices: [
    { value: "bw", label: "Black & white" },
    { value: "color", label: "Full colour", addPerUnit: 0.75 },
  ],
};
const SIDES = {
  key: "sides", label: "Sides", type: "radio" as const, required: true, default: "single",
  choices: [
    { value: "single", label: "Single-sided" },
    { value: "double", label: "Double-sided", multiplier: 1.6 },
  ],
};
const PAPER_GSM_DOC = {
  key: "paper", label: "Paper", type: "select" as const, default: "80",
  choices: [
    { value: "80", label: "80 gsm standard" },
    { value: "100", label: "100 gsm premium", addPerUnit: 0.1 },
    { value: "160", label: "160 gsm card", addPerUnit: 0.4 },
  ],
};
const BINDING = {
  key: "binding", label: "Finishing", type: "select" as const, default: "none",
  choices: [
    { value: "none", label: "Loose sheets" },
    { value: "staple", label: "Stapled", flat: 2 },
    { value: "spiral", label: "Spiral bound", flat: 10 },
    { value: "thermal", label: "Thermal / soft cover", flat: 15 },
    { value: "hardcover", label: "Hard cover", flat: 45 },
  ],
};

/** Global photo print sizes (ISO, US/inch and Asian "R" sizes). */
const PHOTO_SIZES = {
  key: "size", label: "Print size", type: "select" as const, required: true, default: "4x6",
  choices: [
    { value: "wallet", label: "Wallet 2.5 × 3.5 in (6.4 × 8.9 cm)", addPerUnit: -0.5, widthMm: 64, heightMm: 89 },
    { value: "3.5x5", label: "3R 3.5 × 5 in (9 × 13 cm)", addPerUnit: -0.25, widthMm: 89, heightMm: 127 },
    { value: "4x6", label: "4R 4 × 6 in (10 × 15 cm)", widthMm: 102, heightMm: 152 },
    { value: "5x7", label: "5R 5 × 7 in (13 × 18 cm)", addPerUnit: 1.5, widthMm: 127, heightMm: 178 },
    { value: "6x8", label: "6R 6 × 8 in (15 × 20 cm)", addPerUnit: 2.5, widthMm: 152, heightMm: 203 },
    { value: "8x10", label: "8R 8 × 10 in (20 × 25 cm)", addPerUnit: 5, widthMm: 203, heightMm: 254 },
    { value: "8x12", label: "8 × 12 in (20 × 30 cm)", addPerUnit: 6, widthMm: 203, heightMm: 305 },
    { value: "10x12", label: "10R 10 × 12 in (25 × 30 cm)", addPerUnit: 9, widthMm: 254, heightMm: 305 },
    { value: "11x14", label: "11 × 14 in (28 × 36 cm)", addPerUnit: 14, widthMm: 279, heightMm: 356 },
    { value: "12x18", label: "12 × 18 in (30 × 45 cm)", addPerUnit: 20, widthMm: 305, heightMm: 457 },
    { value: "16x20", label: "16 × 20 in (40 × 50 cm)", addPerUnit: 35, widthMm: 406, heightMm: 508 },
    { value: "20x30", label: "20 × 30 in (50 × 75 cm)", addPerUnit: 60, widthMm: 508, heightMm: 762 },
    { value: "a4", label: "A4 photo (21 × 29.7 cm)", addPerUnit: 7, widthMm: 210, heightMm: 297 },
    { value: "a3", label: "A3 photo (29.7 × 42 cm)", addPerUnit: 16, widthMm: 297, heightMm: 420 },
    { value: "square-4", label: "Square 4 × 4 in (10 × 10 cm)", widthMm: 102, heightMm: 102 },
    { value: "square-8", label: "Square 8 × 8 in (20 × 20 cm)", addPerUnit: 4, widthMm: 203, heightMm: 203 },
    { value: "square-12", label: "Square 12 × 12 in (30 × 30 cm)", addPerUnit: 12, widthMm: 305, heightMm: 305 },
    { value: "panorama", label: "Panorama 4 × 12 in (10 × 30 cm)", addPerUnit: 6, widthMm: 102, heightMm: 305 },
  ],
};
const PHOTO_FINISH = {
  key: "finish", label: "Finish", type: "radio" as const, default: "glossy",
  choices: [
    { value: "glossy", label: "Glossy" },
    { value: "matte", label: "Matte" },
    { value: "lustre", label: "Lustre / satin", addPerUnit: 0.25 },
  ],
};

/** Passport / visa photo presets by country document spec. */
const PASSPORT_SPECS = {
  key: "spec", label: "Document / country", type: "select" as const, required: true, default: "uae",
  choices: [
    { value: "uae", label: "UAE passport / Emirates ID / visa (43 × 55 mm, white bg)", widthMm: 43, heightMm: 55 },
    { value: "india", label: "India passport / OCI (51 × 51 mm)", widthMm: 51, heightMm: 51 },
    { value: "us", label: "USA passport / visa (2 × 2 in)", widthMm: 51, heightMm: 51 },
    { value: "uk", label: "UK passport (35 × 45 mm)", widthMm: 35, heightMm: 45 },
    { value: "schengen", label: "Schengen visa (35 × 45 mm)", widthMm: 35, heightMm: 45 },
    { value: "pakistan", label: "Pakistan passport (35 × 45 mm)", widthMm: 35, heightMm: 45 },
    { value: "philippines", label: "Philippines passport (35 × 45 mm)", widthMm: 35, heightMm: 45 },
    { value: "saudi", label: "Saudi visa (40 × 60 mm)", widthMm: 40, heightMm: 60 },
    { value: "canada", label: "Canada passport (50 × 70 mm)", widthMm: 50, heightMm: 70 },
    { value: "china", label: "China visa (33 × 48 mm)", widthMm: 33, heightMm: 48 },
  ],
};

const CARD_STOCK = {
  key: "stock", label: "Card stock", type: "select" as const, default: "350matte",
  choices: [
    { value: "350matte", label: "350 gsm matte" },
    { value: "350gloss", label: "350 gsm gloss" },
    { value: "400softtouch", label: "400 gsm soft-touch laminated", multiplier: 1.5 },
    { value: "600luxe", label: "600 gsm luxe (extra thick)", multiplier: 2.4 },
    { value: "kraft", label: "Kraft recycled", multiplier: 1.3 },
  ],
};
const CARD_SIZE = {
  key: "card_size", label: "Card size", type: "radio" as const, default: "85x55",
  choices: [
    { value: "85x55", label: "Standard 85 × 55 mm", widthMm: 85, heightMm: 55 },
    { value: "89x51", label: "US 3.5 × 2 in", widthMm: 89, heightMm: 51 },
    { value: "55x55", label: "Square 55 × 55 mm", multiplier: 1.1, widthMm: 55, heightMm: 55 },
  ],
};
const CARD_FINISH = {
  key: "card_finish", label: "Special finish", type: "select" as const, default: "none",
  choices: [
    { value: "none", label: "None" },
    { value: "rounded", label: "Rounded corners", flat: 15 },
    { value: "spotuv", label: "Spot UV", flat: 60 },
    { value: "gold", label: "Gold foil", flat: 90 },
    { value: "emboss", label: "Embossing", flat: 120 },
  ],
};

const FRAMES = {
  key: "frame", label: "Frame style", type: "select" as const, required: true, default: "black-classic",
  choices: [
    { value: "black-classic", label: "Classic black wood" },
    { value: "white-modern", label: "Modern white" },
    { value: "natural-oak", label: "Natural oak", addPerUnit: 15 },
    { value: "walnut", label: "Walnut", addPerUnit: 20 },
    { value: "gold-ornate", label: "Gold ornate", addPerUnit: 45 },
    { value: "silver-metal", label: "Brushed silver aluminium", addPerUnit: 25 },
    { value: "floating-acrylic", label: "Floating acrylic", addPerUnit: 55 },
    { value: "canvas-wrap", label: "Canvas gallery wrap (no frame)", addPerUnit: 30 },
  ],
};
const FRAME_SIZES = {
  key: "size", label: "Frame size", type: "select" as const, required: true, default: "a4",
  choices: [
    { value: "4x6", label: "4 × 6 in (10 × 15 cm)", addPerUnit: -20 },
    { value: "5x7", label: "5 × 7 in (13 × 18 cm)", addPerUnit: -10 },
    { value: "8x10", label: "8 × 10 in (20 × 25 cm)" },
    { value: "a4", label: "A4 (21 × 30 cm)", addPerUnit: 5 },
    { value: "11x14", label: "11 × 14 in (28 × 36 cm)", addPerUnit: 25 },
    { value: "a3", label: "A3 (30 × 42 cm)", addPerUnit: 35 },
    { value: "16x20", label: "16 × 20 in (40 × 50 cm)", addPerUnit: 60 },
    { value: "a2", label: "A2 (42 × 59 cm)", addPerUnit: 95 },
    { value: "a1", label: "A1 (59 × 84 cm)", addPerUnit: 170 },
  ],
};
const MOUNT = {
  key: "mount", label: "Mount / glazing", type: "radio" as const, default: "none",
  choices: [
    { value: "none", label: "No mount, standard glass" },
    { value: "mount", label: "White passe-partout mount", addPerUnit: 12 },
    { value: "museum", label: "Mount + anti-glare museum glass", addPerUnit: 40 },
  ],
};

const FLYER_SIZE = {
  key: "size", label: "Size", type: "select" as const, required: true, default: "A5",
  choices: [
    { value: "DL", label: "DL (99 × 210 mm)", multiplier: 0.7 },
    { value: "A6", label: "A6 (105 × 148 mm)", multiplier: 0.6 },
    { value: "A5", label: "A5 (148 × 210 mm)" },
    { value: "A4", label: "A4 (210 × 297 mm)", multiplier: 1.8 },
    { value: "A3", label: "A3 (297 × 420 mm)", multiplier: 3.4 },
  ],
};
const FLYER_PAPER = {
  key: "paper", label: "Paper", type: "select" as const, default: "150gloss",
  choices: [
    { value: "130gloss", label: "130 gsm gloss", multiplier: 0.9 },
    { value: "150gloss", label: "150 gsm gloss" },
    { value: "170matte", label: "170 gsm matte", multiplier: 1.1 },
    { value: "300card", label: "300 gsm card", multiplier: 1.6 },
  ],
};
const DESIGN_SERVICE = {
  key: "design", label: "Artwork", type: "radio" as const, default: "own",
  choices: [
    { value: "own", label: "I'll upload print-ready artwork" },
    { value: "pro", label: "Design it for me", flat: 150 },
  ],
};

export interface DefaultProduct {
  kind: ProductKind;
  name: string;
  slug: string;
  description: string;
  featured?: boolean;
  turnaroundHours: number;
  /** storefront grouping, e.g. "Mugs", "Apparel", "Gifts" */
  category?: string;
  config: ProductConfig;
}

export const DEFAULT_PRODUCTS: DefaultProduct[] = [
  {
    kind: "document", slug: "document-printing", name: "Document Printing", featured: true, turnaroundHours: 2,
    description: "Upload PDF, Word or images. Priced per page by paper size, colour and finishing.",
    config: {
      perPage: true, requiresUpload: true, acceptedFiles: ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png",
      tiers: [{ min: 1, unitPrice: 0.5 }, { min: 100, unitPrice: 0.4 }, { min: 500, unitPrice: 0.3 }, { min: 2000, unitPrice: 0.22 }],
      optionGroups: [PAPER_SIZES, COLOR_MODE, SIDES, PAPER_GSM_DOC, BINDING],
    },
  },
  {
    kind: "confidential_document", slug: "confidential-printing", name: "Confidential Document Printing", turnaroundHours: 2,
    description: "Encrypted upload, restricted staff access, sealed envelope and automatic file deletion after collection.",
    config: {
      perPage: true, requiresUpload: true, acceptedFiles: ".pdf,.doc,.docx,.jpg,.jpeg,.png",
      tiers: [{ min: 1, unitPrice: 0.8 }, { min: 100, unitPrice: 0.6 }],
      optionGroups: [
        PAPER_SIZES, COLOR_MODE, SIDES,
        { key: "handling", label: "Secure handling", type: "radio", default: "sealed", choices: [
          { value: "sealed", label: "Sealed tamper-evident envelope", flat: 5 },
          { value: "sealed_signed", label: "Sealed + signature on delivery", flat: 15 },
        ] },
      ],
    },
  },
  {
    kind: "photo", slug: "photo-prints", name: "Photo Prints", featured: true, turnaroundHours: 4,
    description: "Every popular global size from wallet to 20×30 in, on glossy, matte or lustre photo paper.",
    config: {
      requiresUpload: true, acceptedFiles: ".jpg,.jpeg,.png,.heic,.webp,.tif,.tiff",
      tiers: [{ min: 1, unitPrice: 2 }, { min: 25, unitPrice: 1.5 }, { min: 100, unitPrice: 1.1 }],
      optionGroups: [PHOTO_SIZES, PHOTO_FINISH, { key: "border", label: "Border", type: "radio", default: "none", choices: [
        { value: "none", label: "Borderless" }, { value: "white", label: "White border" },
      ] }],
    },
  },
  {
    kind: "passport_photo", slug: "passport-photos", name: "Passport & Visa Photos", featured: true, turnaroundHours: 1,
    description: "Correct size and white background for UAE, India, USA, UK, Schengen and more. Sheet of 6 or 8.",
    config: {
      requiresUpload: true, acceptedFiles: ".jpg,.jpeg,.png,.heic",
      quantityPresets: [1, 2, 3],
      tiers: [{ min: 1, unitPrice: 25 }],
      optionGroups: [PASSPORT_SPECS,
        { key: "copies", label: "Photos per set", type: "radio", default: "6", choices: [
          { value: "6", label: "6 photos" }, { value: "8", label: "8 photos", addPerUnit: 5 },
        ] },
        { key: "retouch", label: "Background & retouch", type: "radio", default: "bg", choices: [
          { value: "bg", label: "Background cleanup (included)" },
          { value: "pro", label: "Pro retouch + compliance check", flat: 15 },
        ] },
        { key: "digital", label: "Digital copy (for online visa)", type: "radio", default: "no", choices: [
          { value: "no", label: "No" }, { value: "yes", label: "Yes, email me the JPG", flat: 10 },
        ] },
      ],
    },
  },
  {
    kind: "photo_frame", slug: "framed-prints", name: "Framed Photo Prints", featured: true, turnaroundHours: 48,
    description: "Choose your frame, size and mount. Printed, framed and ready to hang.",
    config: {
      requiresUpload: true, acceptedFiles: ".jpg,.jpeg,.png,.heic,.webp,.tif,.tiff",
      tiers: [{ min: 1, unitPrice: 79 }, { min: 5, unitPrice: 69 }],
      optionGroups: [FRAMES, FRAME_SIZES, MOUNT],
    },
  },
  {
    kind: "business_card", slug: "business-cards", name: "Business Cards", featured: true, turnaroundHours: 48,
    description: "Design with AI in seconds, use our designer, or upload your own artwork.",
    config: {
      designer: true, acceptedFiles: ".pdf,.ai,.eps,.png,.jpg",
      quantityPresets: [100, 250, 500, 1000, 2000],
      tiers: [{ min: 100, unitPrice: 0.6 }, { min: 250, unitPrice: 0.36 }, { min: 500, unitPrice: 0.24 }, { min: 1000, unitPrice: 0.16 }, { min: 2000, unitPrice: 0.12 }],
      optionGroups: [CARD_SIZE, CARD_STOCK, SIDES, CARD_FINISH],
    },
  },
  {
    kind: "flyer", slug: "flyers", name: "Flyers & Leaflets", featured: true, turnaroundHours: 48,
    description: "Promote your business with vibrant full-colour flyers, from 50 to 10,000.",
    config: {
      requiresUpload: true, acceptedFiles: ".pdf,.ai,.eps,.png,.jpg",
      quantityPresets: [50, 100, 250, 500, 1000, 2500, 5000, 10000],
      tiers: [{ min: 50, unitPrice: 1.2 }, { min: 250, unitPrice: 0.6 }, { min: 1000, unitPrice: 0.3 }, { min: 5000, unitPrice: 0.18 }],
      optionGroups: [FLYER_SIZE, FLYER_PAPER, SIDES, DESIGN_SERVICE],
    },
  },
  {
    kind: "brochure", slug: "brochures", name: "Brochures", turnaroundHours: 72,
    description: "Bi-fold, tri-fold and saddle-stitched booklets for menus, catalogues and company profiles.",
    config: {
      requiresUpload: true, acceptedFiles: ".pdf,.ai,.indd",
      quantityPresets: [50, 100, 250, 500, 1000],
      tiers: [{ min: 50, unitPrice: 3.5 }, { min: 250, unitPrice: 2.2 }, { min: 1000, unitPrice: 1.4 }],
      optionGroups: [
        { key: "fold", label: "Format", type: "select", required: true, default: "trifold-a4", choices: [
          { value: "bifold-a4", label: "Bi-fold A4 → A5" },
          { value: "trifold-a4", label: "Tri-fold A4 → DL" },
          { value: "booklet-8", label: "Booklet A5, 8 pages", multiplier: 2 },
          { value: "booklet-16", label: "Booklet A5, 16 pages", multiplier: 3.6 },
          { value: "booklet-a4-12", label: "Booklet A4, 12 pages (company profile)", multiplier: 5 },
        ] },
        { key: "paper", label: "Paper", type: "select", default: "170gloss", choices: [
          { value: "150gloss", label: "150 gsm gloss", multiplier: 0.9 },
          { value: "170gloss", label: "170 gsm gloss" },
          { value: "250matte", label: "250 gsm matte", multiplier: 1.3 },
        ] },
        DESIGN_SERVICE,
      ],
    },
  },
  {
    kind: "notebook", slug: "custom-notebooks", name: "Custom Notebooks", turnaroundHours: 96,
    description: "Branded notebooks with your logo — perfect for corporate gifts and events.",
    config: {
      requiresUpload: true, acceptedFiles: ".pdf,.ai,.png,.jpg", minQuantity: 10,
      tiers: [{ min: 10, unitPrice: 28 }, { min: 50, unitPrice: 21 }, { min: 200, unitPrice: 16 }],
      optionGroups: [
        { key: "size", label: "Size", type: "radio", default: "A5", choices: [
          { value: "A6", label: "A6 pocket", addPerUnit: -6 }, { value: "A5", label: "A5" }, { value: "A4", label: "A4", addPerUnit: 8 },
        ] },
        { key: "cover", label: "Cover", type: "select", default: "soft", choices: [
          { value: "soft", label: "Soft cover printed" },
          { value: "hard", label: "Hard cover printed", addPerUnit: 7 },
          { value: "pu", label: "PU leather + debossed logo", addPerUnit: 14 },
        ] },
        { key: "binding", label: "Binding", type: "radio", default: "wire", choices: [
          { value: "wire", label: "Wire-O" }, { value: "perfect", label: "Perfect bound", addPerUnit: 2 }, { value: "sewn", label: "Sewn", addPerUnit: 4 },
        ] },
        { key: "pages", label: "Inner pages", type: "select", default: "ruled-80", choices: [
          { value: "ruled-80", label: "80 pages ruled" }, { value: "dotted-80", label: "80 pages dotted" },
          { value: "ruled-160", label: "160 pages ruled", addPerUnit: 5 },
        ] },
      ],
    },
  },
  {
    kind: "poster", slug: "posters", name: "Posters & Large Format", turnaroundHours: 24,
    description: "A3 to A0 posters, roll-ups and foam boards for events and retail.",
    config: {
      requiresUpload: true, acceptedFiles: ".pdf,.jpg,.png,.tif",
      tiers: [{ min: 1, unitPrice: 15 }, { min: 10, unitPrice: 12 }],
      optionGroups: [
        { key: "size", label: "Size", type: "select", required: true, default: "A2", choices: [
          { value: "A3", label: "A3", multiplier: 0.5 }, { value: "A2", label: "A2" },
          { value: "A1", label: "A1", multiplier: 1.8 }, { value: "A0", label: "A0", multiplier: 3.2 },
          { value: "rollup", label: "Roll-up banner 85 × 200 cm incl. stand", addPerUnit: 160 },
        ] },
        { key: "material", label: "Material", type: "select", default: "paper", choices: [
          { value: "paper", label: "Satin poster paper" },
          { value: "foam", label: "5 mm foam board", addPerUnit: 25 },
          { value: "vinyl", label: "Vinyl (outdoor)", addPerUnit: 18 },
        ] },
      ],
    },
  },
];


/* ---------- merchandise & gift templates ----------
   STARTER PRICES ONLY (AED, excl. VAT): every owner must set their own prices. Used by "Add from template" and the product builder. */
const ART = ".png,.jpg,.jpeg,.svg,.pdf";
const choice = (value: string, label: string, extra: Partial<{ addPerUnit: number; multiplier: number; flat: number; hint: string }> = {}) => ({ value, label, ...extra });
const COLOURS = (list: string[]): ProductConfig["optionGroups"][number] => ({ key: "colour", label: "Colour", type: "select", required: true, default: list[0].toLowerCase(), choices: list.map((c) => choice(c.toLowerCase(), c)) });
const SIZES = (list: [string, number?][]): ProductConfig["optionGroups"][number] => ({ key: "size", label: "Size", type: "select", required: true, default: list[Math.min(2, list.length - 1)][0].toLowerCase(), choices: list.map(([l, add]) => choice(l.toLowerCase(), l, add ? { addPerUnit: add } : {})) });
const PRINT_POSITION: ProductConfig["optionGroups"][number] = { key: "print_position", label: "Print position", type: "select", required: true, default: "front", choices: [choice("front", "Front"), choice("back", "Back", { addPerUnit: 8 }), choice("front_back", "Front + back", { addPerUnit: 14 })] };
const PERSONAL_TEXT = (label: string, max = 24, flat?: number) => ({ fields: [{ key: "text", label, type: "text" as const, maxLength: max, placeholder: "Optional", ...(flat ? { flat } : {}) }], artwork: "optional" as const });
const MOCK = (x: number, y: number, w: number, h: number) => ({ enabled: true, x, y, w, h });
const merch = (slug: string, name: string, category: string, description: string, config: ProductConfig, turnaroundHours = 72, kind: ProductKind = "merchandise"): DefaultProduct =>
  ({ kind, slug, name, category, description, turnaroundHours, config: { requiresUpload: false, acceptedFiles: ART, ...config } });

export const MERCH_TEMPLATES: DefaultProduct[] = [
  merch("printed-mug", "Printed Mug 11oz", "Mugs", "White ceramic 11oz mug with your photo, logo or text, printed wrap-around.", {
    tiers: [{ min: 1, unitPrice: 29 }, { min: 12, unitPrice: 24 }, { min: 48, unitPrice: 19 }],
    optionGroups: [{ key: "mug_type", label: "Mug type", type: "select", required: true, default: "white", choices: [choice("white", "White ceramic"), choice("colour_inside", "Coloured inside + handle", { addPerUnit: 4 }), choice("magic", "Magic (colour-changing)", { addPerUnit: 14 })] }],
    personalisation: PERSONAL_TEXT("Name or short text on the mug", 24), mockup: MOCK(22, 28, 56, 44),
  }, 48),
  merch("t-shirt", "Custom T-shirt", "Apparel", "Cotton t-shirt printed with your design. Choose size, colour and print position.", {
    tiers: [{ min: 1, unitPrice: 59 }, { min: 10, unitPrice: 49 }, { min: 50, unitPrice: 39 }],
    optionGroups: [SIZES([["S"], ["M"], ["L"], ["XL"], ["2XL", 4], ["3XL", 6]]), COLOURS(["White", "Black", "Navy", "Red", "Grey"]), PRINT_POSITION],
    personalisation: PERSONAL_TEXT("Text under the design (optional)", 30), mockup: MOCK(32, 24, 36, 38),
  }),
  merch("polo-shirt", "Polo Shirt with Logo", "Apparel", "Embroidered or printed polo shirts for staff uniforms and teams.", {
    tiers: [{ min: 1, unitPrice: 79 }, { min: 10, unitPrice: 65 }, { min: 50, unitPrice: 55 }],
    optionGroups: [SIZES([["S"], ["M"], ["L"], ["XL"], ["2XL", 4]]), COLOURS(["White", "Black", "Navy", "Red"]), { key: "method", label: "Logo method", type: "select", required: true, default: "print", choices: [choice("print", "Printed"), choice("embroidery", "Embroidered", { addPerUnit: 10 })] }],
    mockup: MOCK(54, 30, 16, 14),
  }),
  merch("cap", "Custom Cap", "Apparel", "Baseball cap with your logo, embroidered or printed on the front.", {
    tiers: [{ min: 1, unitPrice: 45 }, { min: 12, unitPrice: 38 }, { min: 50, unitPrice: 32 }],
    optionGroups: [COLOURS(["Black", "White", "Navy", "Red", "Khaki"]), { key: "method", label: "Logo method", type: "select", required: true, default: "embroidery", choices: [choice("embroidery", "Embroidered"), choice("print", "Printed", { addPerUnit: -6 })] }],
    mockup: MOCK(30, 30, 40, 22),
  }),
  merch("hoodie", "Custom Hoodie", "Apparel", "Fleece hoodie printed with your design.", {
    tiers: [{ min: 1, unitPrice: 119 }, { min: 10, unitPrice: 99 }, { min: 50, unitPrice: 85 }],
    optionGroups: [SIZES([["S"], ["M"], ["L"], ["XL"], ["2XL", 6]]), COLOURS(["Black", "Grey", "Navy"]), PRINT_POSITION], mockup: MOCK(32, 28, 36, 30),
  }),
  merch("tote-bag", "Printed Tote Bag", "Bags", "Cotton tote bag with a one-colour or full-colour print.", {
    tiers: [{ min: 1, unitPrice: 25 }, { min: 25, unitPrice: 19 }, { min: 100, unitPrice: 14 }],
    optionGroups: [COLOURS(["Natural", "Black", "Navy"]), { key: "print", label: "Print", type: "select", required: true, default: "full", choices: [choice("one", "One colour", { addPerUnit: -3 }), choice("full", "Full colour")] }],
    mockup: MOCK(28, 38, 44, 40),
  }),
  merch("water-bottle", "Custom Water Bottle", "Drinkware", "Stainless steel bottle with your logo or name.", {
    tiers: [{ min: 1, unitPrice: 49 }, { min: 12, unitPrice: 41 }, { min: 48, unitPrice: 35 }],
    optionGroups: [COLOURS(["Silver", "Black", "White", "Blue"]), { key: "size", label: "Capacity", type: "select", required: true, default: "500", choices: [choice("500", "500 ml"), choice("750", "750 ml", { addPerUnit: 8 })] }],
    personalisation: PERSONAL_TEXT("Name on the bottle", 20, 5), mockup: MOCK(36, 30, 28, 40),
  }),
  merch("keychain", "Custom Keychain", "Keychains", "Keychains printed or engraved with your design, in acrylic, PVC or metal.", {
    minQuantity: 10, tiers: [{ min: 10, unitPrice: 12 }, { min: 50, unitPrice: 9 }, { min: 200, unitPrice: 6.5 }],
    optionGroups: [{ key: "material", label: "Material", type: "select", required: true, default: "acrylic", choices: [choice("acrylic", "Acrylic"), choice("pvc", "Soft PVC", { addPerUnit: 2 }), choice("metal", "Metal", { addPerUnit: 5 })] }, { key: "shape", label: "Shape", type: "select", required: true, default: "round", choices: [choice("round", "Round"), choice("square", "Square"), choice("custom", "Custom cut", { addPerUnit: 3 })] }],
    personalisation: { fields: [], artwork: "required" }, mockup: MOCK(25, 25, 50, 50),
  }, 96),
  merch("lanyard", "Printed Lanyard", "Corporate", "Lanyards with your logo for events, staff and visitors.", {
    minQuantity: 25, tiers: [{ min: 25, unitPrice: 9 }, { min: 100, unitPrice: 6.5 }, { min: 500, unitPrice: 4.8 }],
    optionGroups: [{ key: "width", label: "Width", type: "select", required: true, default: "20", choices: [choice("15", "15 mm", { addPerUnit: -1 }), choice("20", "20 mm"), choice("25", "25 mm", { addPerUnit: 1.5 })] }, { key: "clip", label: "Clip", type: "select", default: "swivel", choices: [choice("swivel", "Swivel hook"), choice("badge", "Badge holder", { addPerUnit: 2 })] }],
    personalisation: { fields: [], artwork: "required" },
  }, 120),
  merch("branded-pen", "Branded Pen", "Corporate", "Promotional pens printed with your logo.", {
    minQuantity: 50, tiers: [{ min: 50, unitPrice: 6 }, { min: 200, unitPrice: 4.2 }, { min: 1000, unitPrice: 3 }],
    optionGroups: [{ key: "ink", label: "Ink colour", type: "select", required: true, default: "blue", choices: [choice("blue", "Blue"), choice("black", "Black")] }],
    personalisation: { fields: [], artwork: "required" },
  }, 120),
  merch("mouse-pad", "Custom Mouse Pad", "Office", "Rubber-backed mouse pad printed edge to edge.", {
    tiers: [{ min: 1, unitPrice: 29 }, { min: 10, unitPrice: 23 }, { min: 50, unitPrice: 18 }],
    optionGroups: [{ key: "size", label: "Size", type: "select", required: true, default: "standard", choices: [choice("standard", "Standard 22 × 18 cm"), choice("large", "Large 30 × 25 cm", { addPerUnit: 8 })] }],
    personalisation: { fields: [], artwork: "required" }, mockup: MOCK(8, 12, 84, 76),
  }, 72),
  merch("phone-case", "Custom Phone Case", "Accessories", "Phone case with your photo or design.", {
    tiers: [{ min: 1, unitPrice: 49 }, { min: 10, unitPrice: 42 }],
    optionGroups: [{ key: "model", label: "Phone model", type: "select", required: true, default: "iphone_15", choices: [choice("iphone_15", "iPhone 15"), choice("iphone_14", "iPhone 14"), choice("iphone_13", "iPhone 13"), choice("galaxy_s24", "Samsung Galaxy S24"), choice("galaxy_s23", "Samsung Galaxy S23"), choice("other", "Other (tell us in the notes)")] }, { key: "finish", label: "Finish", type: "select", default: "glossy", choices: [choice("glossy", "Glossy"), choice("matte", "Matte")] }],
    personalisation: { fields: [{ key: "note", label: "Notes (exact phone model if 'Other')", type: "text", maxLength: 60 }], artwork: "required" }, mockup: MOCK(20, 8, 60, 84),
  }, 72),
  merch("photo-cushion", "Photo Cushion", "Home", "Soft cushion printed with your photo, includes the filling.", {
    tiers: [{ min: 1, unitPrice: 69 }, { min: 6, unitPrice: 59 }],
    optionGroups: [{ key: "size", label: "Size", type: "select", required: true, default: "40", choices: [choice("30", "30 × 30 cm", { addPerUnit: -10 }), choice("40", "40 × 40 cm"), choice("50", "50 × 50 cm", { addPerUnit: 15 })] }],
    personalisation: { fields: [], artwork: "required" }, mockup: MOCK(12, 12, 76, 76),
  }, 96),
  merch("gift-box", "Gift Box", "Gifts", "Rigid gift box with your logo or message, ready to fill.", {
    minQuantity: 10, tiers: [{ min: 10, unitPrice: 22 }, { min: 50, unitPrice: 17 }, { min: 200, unitPrice: 13 }],
    optionGroups: [{ key: "size", label: "Box size", type: "select", required: true, default: "medium", choices: [choice("small", "Small 15 × 15 × 8 cm", { addPerUnit: -5 }), choice("medium", "Medium 22 × 22 × 10 cm"), choice("large", "Large 30 × 25 × 12 cm", { addPerUnit: 9 })] }, { key: "finish", label: "Finish", type: "select", default: "matte", choices: [choice("matte", "Matte"), choice("gloss", "Gloss", { addPerUnit: 2 }), choice("foil", "Gold foil logo", { addPerUnit: 6 })] }],
    personalisation: { fields: [], artwork: "required" }, quote: { enabled: true, label: "Need a custom size? Request a quote" },
  }, 168, "gift_pack"),
  merch("custom-gift-pack", "Custom Gift Pack", "Gifts", "Build a gift pack: choose the box, what goes inside, the ribbon and a personal card. Corporate and wedding packs welcome.", {
    minQuantity: 1, tiers: [{ min: 1, unitPrice: 59 }, { min: 10, unitPrice: 52 }, { min: 50, unitPrice: 46 }],
    optionGroups: [
      { key: "box", label: "Box", type: "select", required: true, default: "medium", choices: [choice("small", "Small box", { addPerUnit: -8 }), choice("medium", "Medium box"), choice("large", "Large box", { addPerUnit: 14 })] },
      { key: "item1", label: "Item 1", type: "select", required: true, default: "mug", choices: [choice("mug", "Printed mug", { addPerUnit: 22 }), choice("bottle", "Water bottle", { addPerUnit: 32 }), choice("notebook", "Notebook", { addPerUnit: 18 }), choice("none", "None")] },
      { key: "item2", label: "Item 2", type: "select", default: "none", choices: [choice("none", "None"), choice("chocolates", "Chocolates", { addPerUnit: 20 }), choice("dates", "Premium dates", { addPerUnit: 25 }), choice("pen", "Branded pen", { addPerUnit: 8 }), choice("keychain", "Keychain", { addPerUnit: 10 })] },
      { key: "ribbon", label: "Ribbon", type: "select", default: "satin", choices: [choice("none", "No ribbon"), choice("satin", "Satin ribbon", { addPerUnit: 3 }), choice("branded", "Printed ribbon", { addPerUnit: 7 })] },
      { key: "wrap", label: "Packing", type: "select", default: "standard", choices: [choice("standard", "Standard packing"), choice("premium", "Premium wrap + tissue", { addPerUnit: 8 })] },
    ],
    personalisation: { fields: [{ key: "card", label: "Message on the gift card", type: "textarea", maxLength: 160, flat: 0 }, { key: "recipient", label: "Recipient name", type: "text", maxLength: 40 }], artwork: "optional" },
    quote: { enabled: true, label: "Need something special? Request a quote" },
  }, 168, "gift_pack"),
];

/** Everything an owner can add from the "From template" list: the print catalogue plus merchandise and gifts. */
export const ALL_TEMPLATES: DefaultProduct[] = [...DEFAULT_PRODUCTS, ...MERCH_TEMPLATES];
