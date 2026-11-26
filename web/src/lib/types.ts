/** Shared domain types. Kept free of server-only imports so client components can use them. */

export type Emirate =
  | "Abu Dhabi" | "Dubai" | "Sharjah" | "Ajman" | "Umm Al Quwain" | "Ras Al Khaimah" | "Fujairah";
export const EMIRATES: Emirate[] = [
  "Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Umm Al Quwain", "Ras Al Khaimah", "Fujairah",
];

export type ProductKind =
  | "document" | "confidential_document" | "photo" | "passport_photo" | "photo_frame"
  | "business_card" | "flyer" | "brochure" | "notebook" | "poster" | "sticker" | "merchandise" | "gift_pack" | "other";

/**
 * A choice inside an option group. Price effects (all AED, all optional):
 *  - addPerUnit: added to the unit price (unit = one page for per-page products, one piece otherwise)
 *  - multiplier: multiplies the unit price after additions (e.g. double-sided ×1.6)
 *  - flat: one-off setup fee per line (e.g. design fee, frame mounting)
 */
export interface OptionChoice {
  value: string;
  label: string;
  addPerUnit?: number;
  multiplier?: number;
  flat?: number;
  /** e.g. physical size for photos "10 × 15 cm" or a hint */
  hint?: string;
  /** For photo sizes: dimensions in mm, used for crop/quality checks */
  widthMm?: number;
  heightMm?: number;
}

export interface OptionGroup {
  key: string;
  label: string;
  type: "select" | "radio";
  required?: boolean;
  choices: OptionChoice[];
  /** default selected value */
  default?: string;
}

export interface QuantityTier {
  /** minimum quantity (inclusive) for this tier */
  min: number;
  /** base unit price in AED at this tier */
  unitPrice: number;
}

/** A text input the customer fills in (name on a mug, text on a t-shirt). Stored in selections as `p_<key>`. */
export interface PersonalisationField {
  key: string;
  label: string;
  type: "text" | "textarea";
  maxLength: number;
  required?: boolean;
  placeholder?: string;
  /** one-off AED fee added to the line when the customer fills this field in (e.g. engraving) */
  flat?: number;
}
export interface Personalisation {
  fields: PersonalisationField[];
  /** customer artwork upload: none / optional / required */
  artwork: "none" | "optional" | "required";
}
/** Print area on the cover photo, as percentages (0-100) of the image width/height. Used for the live preview. */
export interface MockupArea { enabled: boolean; x: number; y: number; w: number; h: number }
export const PERSONALISATION_PREFIX = "p_";

export interface ProductConfig {
  /** price is per page × copies (documents) instead of per piece */
  perPage?: boolean;
  /** uploads required at checkout */
  requiresUpload?: boolean;
  acceptedFiles?: string; // e.g. ".pdf,.docx,.jpg"
  /** business cards: allow design tool / AI designer */
  designer?: boolean;
  minQuantity?: number;
  /** allowed quantities (for packs like business cards 100/250/500). Empty = free input */
  quantityPresets?: number[];
  tiers: QuantityTier[];
  optionGroups: OptionGroup[];
  personalisation?: Personalisation;
  mockup?: MockupArea;
  /** show a "Request a quote" button on the product page */
  quote?: { enabled: boolean; label?: string };
}

export type Selections = Record<string, string>;

export interface PriceBreakdown {
  unitPrice: number;   // AED per unit after options
  units: number;       // quantity × pages (if perPage) else quantity
  setupFees: number;
  lineTotal: number;   // excl. VAT
  labels: Record<string, string>; // option key -> chosen label
}

export interface Address {
  name: string;
  phone: string;
  line1: string;
  line2?: string;
  area: string;
  city: string;
  emirate: Emirate;
  lat?: number;
  lng?: number;
  notes?: string;
}

export interface PaymentSettings {
  stripe?: { enabled: boolean; publishableKey?: string; secretKeyEnc?: string; webhookSecretEnc?: string };
  mamo?: { enabled: boolean; apiKeyEnc?: string; sandbox?: boolean; webhookSecretEnc?: string };
}

export type DeliveryProviderCode = "inhouse" | "jeebly" | "quiqup" | "careem_box" | "aramex" | "manual";

export interface DeliverySettings {
  enabled: boolean;
  pickupEnabled: boolean;
  /** delivery slot length in minutes, opening hours (24h) */
  slotMinutes: number;
  openHour: number;
  closeHour: number;
  /** days ahead a customer can schedule */
  scheduleDaysAhead: number;
  closedWeekdays: number[]; // 0=Sun..6=Sat
  defaultProvider: DeliveryProviderCode;
  providers: Partial<Record<DeliveryProviderCode, { enabled: boolean; apiKeyEnc?: string; accountId?: string; sandbox?: boolean }>>;
}

export interface WalkInSettings {
  enabled: boolean;
  /** the document product walk-in jobs are priced with (null = first active "document" product) */
  productId: string | null;
  /** jobs with <= this many pages jump to priority 1 (0 = off) */
  smallJobBoostPages: number;
  /** walk-in files are deleted this many hours after printing */
  fileRetentionHours: number;
  maxFilesPerVisit: number;
}
export const DEFAULT_WALK_IN: WalkInSettings = { enabled: false, productId: null, smallJobBoostPages: 5, fileRetentionHours: 24, maxFilesPerVisit: 10 };

export interface TenantSettings {
  vatRate: number;            // 5 for UAE
  pricesIncludeVat: boolean;  // false => VAT added at checkout
  currency: "AED";
  confidentialRetentionHours: number; // auto-purge confidential files after completion
  orderPrefix: string;
  payments: PaymentSettings;
  delivery: DeliverySettings;
  aiDesignerEnabled: boolean;
  walkIn?: Partial<WalkInSettings>;
  announcement?: string;
  heroTitle?: string;
  heroSubtitle?: string;
}

/* ---------- business card design model (shared by designer + AI) ---------- */
export type CardElement =
  | {
      id: string; type: "text"; x: number; y: number; w: number; // mm from top-left
      text: string; fontSize: number; // pt
      fontFamily: string; fontWeight: 400 | 500 | 600 | 700 | 800;
      color: string; align: "left" | "center" | "right"; italic?: boolean; letterSpacing?: number;
    }
  | { id: string; type: "rect"; x: number; y: number; w: number; h: number; fill: string; radius?: number; opacity?: number }
  | { id: string; type: "circle"; x: number; y: number; r: number; fill: string; opacity?: number }
  | { id: string; type: "line"; x: number; y: number; w: number; h: number; color: string; thickness: number }
  | { id: string; type: "image"; x: number; y: number; w: number; h: number; src: string; fit?: "contain" | "cover" }
  | { id: string; type: "qr"; x: number; y: number; size: number; value: string; color?: string };

export interface CardSide {
  background: string;
  elements: CardElement[];
}

export interface CardDesign {
  /** physical size in mm. UAE/EU standard 85×55, US 89×51 */
  widthMm: number;
  heightMm: number;
  orientation: "landscape" | "portrait";
  front: CardSide;
  back?: CardSide;
  name?: string;
}

export const ORDER_STATUSES = [
  "pending_payment", "paid", "in_production", "ready", "out_for_delivery",
  "delivered", "picked_up", "cancelled", "refunded",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  paid: "Paid",
  in_production: "Printing",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  picked_up: "Picked up",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export interface CartLine {
  key: string;            // client id
  productId: string;
  productSlug: string;
  productName: string;
  kind: ProductKind;
  quantity: number;
  pages: number;
  selections: Selections;
  fileIds: string[];
  fileNames: string[];
  design?: CardDesign;
  /** client-side estimate only, server recomputes */
  estimate: number;
}
