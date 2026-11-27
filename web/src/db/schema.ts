import {
  pgTable, text, integer, boolean, timestamp, jsonb, numeric, uuid, pgEnum, uniqueIndex, index, primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { WaCartItem } from "@/server/whatsapp/cart-math";
import type { ProductConfig, TenantSettings, Selections, CardDesign, Address } from "@/lib/types";
import type { CommissionOverride } from "@/lib/commission";

/* ---------- enums ---------- */
export const userRole = pgEnum("user_role", ["superadmin", "owner", "staff", "customer"]);
export const tenantStatus = pgEnum("tenant_status", ["trial", "active", "past_due", "suspended", "cancelled", "incomplete"]);
export const productKind = pgEnum("product_kind", [
  "document", "confidential_document", "photo", "passport_photo", "photo_frame",
  "business_card", "flyer", "brochure", "notebook", "poster", "sticker", "merchandise", "gift_pack", "other",
]);
export const orderStatus = pgEnum("order_status", [
  "pending_payment", "paid", "in_production", "ready", "out_for_delivery",
  "delivered", "picked_up", "cancelled", "refunded",
]);
export const fulfillmentType = pgEnum("fulfillment_type", ["pickup", "delivery"]);
export const paymentProvider = pgEnum("payment_provider", ["stripe", "mamo"]);
export const paymentStatus = pgEnum("payment_status", ["pending", "succeeded", "failed", "refunded"]);
export const printJobStatus = pgEnum("print_job_status", [
  "awaiting_payment", "queued", "printing", "printed", "failed", "cancelled", "needs_manual",
]);
export const invoiceStatus = pgEnum("saas_invoice_status", ["draft", "open", "paid", "void"]);

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const money = (name: string) => numeric(name, { precision: 12, scale: 2, mode: "number" });

/* ---------- SaaS plans ---------- */
export const plans = pgTable("plans", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  priceMonthly: money("price_monthly").notNull().default(0), // AED
  priceYearly: money("price_yearly").notNull().default(0),
  orderFeePct: numeric("order_fee_pct", { precision: 5, scale: 2, mode: "number" }).notNull().default(0),
  /** how shops on this plan pay: 'subscription' (monthly fee, no commission) | 'commission' (no monthly fee, commission per order) */
  billingModel: text("billing_model").notNull().default("subscription"),
  /** free monthly allowance of pay-as-you-go usage per kind, e.g. { ai_chat_turn: 200 } */
  /** AI business-card designs one customer may generate per calendar month on this plan (billed to the shop as usage) */
  aiDesignsPerCustomer: integer("ai_designs_per_customer").notNull().default(3),
  includedUsage: jsonb("included_usage").$type<Record<string, number>>().notNull().default({}),
  /** commission: optional flat fee per print job, and min/max fee per order (null max = no cap) */
  perJobFee: numeric("per_job_fee", { precision: 8, scale: 2, mode: "number" }).notNull().default(0),
  minOrderFee: numeric("min_order_fee", { precision: 8, scale: 2, mode: "number" }).notNull().default(0),
  maxOrderFee: numeric("max_order_fee", { precision: 8, scale: 2, mode: "number" }),
  maxOrdersPerMonth: integer("max_orders_per_month"), // null = unlimited
  maxStaff: integer("max_staff"),
  features: jsonb("features").$type<string[]>().notNull().default([]),
  /** machine-readable feature flags, e.g. "walk_in_queue" (features[] above is marketing text only) */
  flags: jsonb("flags").$type<string[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

/* ---------- tenants (print shops) ---------- */
export const tenants = pgTable("tenants", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  legalName: text("legal_name"),
  trn: text("trn"), // UAE VAT Tax Registration Number
  customDomain: text("custom_domain").unique(),
  logoUrl: text("logo_url"),
  primaryColor: text("primary_color").notNull().default("#e11d48"),
  email: text("email"),
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  address: text("address"),
  emirate: text("emirate").notNull().default("Dubai"),
  /** neighbourhood for the public Live stores directory, e.g. "Al Barsha" */
  area: text("area"),
  /** owner (or superadmin) can hide the shop from the public directory */
  directoryListed: boolean("directory_listed").notNull().default(true),
  /** seller verification: unverified | pending_review | verified | rejected | expired. Live payments, payouts and directory listing need 'verified'. */
  verificationStatus: text("verification_status").notNull().default("unverified"),
  /** card on file for the subscription: none | pending | on_file | failed */
  cardStatus: text("card_status").notNull().default("none"),
  /** sha256 of the gateway card fingerprint: one card cannot start two free trials */
  cardFingerprintHash: text("card_fingerprint_hash"),
  /** payouts are blocked until this time after the bank details were changed */
  payoutHoldUntil: timestamp("payout_hold_until", { withTimezone: true }),
  status: tenantStatus("status").notNull().default("trial"),
  planId: uuid("plan_id").references(() => plans.id),
  billingCycle: text("billing_cycle").notNull().default("monthly"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  stripeCustomerId: text("stripe_customer_id"),
  /** how customer payments for orders reach this shop: 'own' = legacy shop-held keys, 'platform' = collected on the platform Stripe account */
  payoutMode: text("payout_mode").notNull().default("platform"),
  /** Legacy payout-recipient id from the retired second gateway (history only, unused) */
  mamoRecipientId: text("mamo_recipient_id"),
  payoutAccountName: text("payout_account_name"),
  payoutIbanEnc: text("payout_iban_enc"),
  /** last 4 of the IBAN for display (the full IBAN is stored encrypted) */
  payoutIbanLast4: text("payout_iban_last4"),
  /** gateway-specific subscription refs for the shop's QuickPrint plan, e.g. { subscriptionId, subscriberId, cardLast4 } */
  billingRef: jsonb("billing_ref").$type<Record<string, string>>().notNull().default({}),
  /** superadmin-set commission terms for this shop; null = follow the plan */
  commissionOverride: jsonb("commission_override").$type<CommissionOverride | null>(),
  /** plan change requested by the owner; takes effect at the start of the next billing period */
  pendingPlanId: uuid("pending_plan_id"),
  pendingPlanAt: timestamp("pending_plan_at", { withTimezone: true }),
  autoRenew: boolean("auto_renew").notNull().default(true),
  /** legal hold: personal-data deletion and purge jobs must skip this shop's records while a dispute/investigation is open */
  legalHold: boolean("legal_hold").notNull().default(false),
  /** shop's cancellation / returns / delivery terms, shown before payment and on the order confirmation */
  returnsPolicy: text("returns_policy"),
  /** where customers can send complaints (defaults to the shop email) */
  complaintEmail: text("complaint_email"),
  settings: jsonb("settings").$type<TenantSettings>().notNull().default({} as TenantSettings),
  createdAt: createdAt(),
});

/* ---------- users (superadmin, shop owner/staff, customers) ---------- */
export const users = pgTable("users", {
  id: id(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }), // null => platform superadmin
  role: userRole("role").notNull(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  /** canonical forms for the one-person-one-shop guard rail (see src/lib/trust/normalise.ts) */
  emailCanonical: text("email_canonical"),
  phoneCanonical: text("phone_canonical"),
  /** TOTP two-factor (superadmin required, shop owners optional) */
  totpSecretEnc: text("totp_secret_enc"),
  totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),
  recoveryCodesHash: jsonb("recovery_codes_hash").$type<string[]>().notNull().default([]),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  active: boolean("active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  /** marketing messages need an explicit opt-in (transactional messages do not) */
  marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
  marketingOptInAt: timestamp("marketing_opt_in_at", { withTimezone: true }),
  /** set when the personal data of this account was erased/anonymised on request */
  anonymisedAt: timestamp("anonymised_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("users_tenant_email_idx").on(sql`coalesce(${t.tenantId}::text, 'platform')`, sql`lower(${t.email})`),
  // one person = one shop owner account, platform-wide
  uniqueIndex("users_owner_email_canonical_idx").on(t.emailCanonical).where(sql`${t.role} = 'owner' and ${t.emailCanonical} is not null`),
  uniqueIndex("users_owner_phone_canonical_idx").on(t.phoneCanonical).where(sql`${t.role} = 'owner' and ${t.phoneCanonical} is not null`),
]);

export const passwordResets = pgTable("password_resets", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("password_resets_user_idx").on(t.userId)]);

/* ---------- catalog ---------- */
export const products = pgTable("products", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  kind: productKind("kind").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description").notNull().default(""),
  imageUrl: text("image_url"),
  active: boolean("active").notNull().default(true),
  featured: boolean("featured").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  turnaroundHours: integer("turnaround_hours").notNull().default(24),
  /** shop-facing grouping on the storefront, e.g. "Mugs", "Apparel", "Gifts" (free text) */
  category: text("category"),
  /** extra gallery photos; imageUrl stays the cover */
  images: jsonb("images").$type<string[]>().notNull().default([]),
  /** owner-only data (cost price, notes). NEVER select this for storefront queries. */
  internal: jsonb("internal").$type<{ costPrice?: number; note?: string }>().notNull().default({}),
  config: jsonb("config").$type<ProductConfig>().notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("products_tenant_slug_idx").on(t.tenantId, t.slug)]);

export const pickupLocations = pgTable("pickup_locations", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  address: text("address").notNull(),
  emirate: text("emirate").notNull(),
  hours: text("hours").notNull().default("Sat–Thu 9:00–21:00"),
  mapUrl: text("map_url"),
  active: boolean("active").notNull().default(true),
});

export const deliveryZones = pgTable("delivery_zones", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  emirate: text("emirate").notNull(),
  fee: money("fee").notNull(),
  freeAbove: money("free_above"),
  minLeadHours: integer("min_lead_hours").notNull().default(24),
  sameDay: boolean("same_day").notNull().default(false),
  active: boolean("active").notNull().default(true),
});

/* ---------- files ---------- */
export const files = pgTable("files", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  orderId: uuid("order_id"),
  filename: text("filename").notNull(),
  storageKey: text("storage_key").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  pageCount: integer("page_count"),
  widthPx: integer("width_px"),
  heightPx: integer("height_px"),
  confidential: boolean("confidential").notNull().default(false),
  deleteAfter: timestamp("delete_after", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("files_tenant_idx").on(t.tenantId)]);

/* ---------- orders ---------- */
/** Platform-level payment gateway (singleton per provider): collects SaaS subscriptions and platform-routed order payments. Secrets stored encrypted. */
/** Superadmin-controlled platform settings (key/value), e.g. { trialDays: 7 }. Read through src/server/platform-settings.ts. */
export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedBy: uuid("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Seasonal subscription offers for shop owners (Black Friday, Winter, Summer, Ramadan...), created by the superadmin. */
export const offers = pgTable("offers", {
  id: id(),
  name: text("name").notNull(),
  /** optional promo code the owner types at signup; blank = campaign (auto-applied) */
  code: text("code"),
  headline: text("headline").notNull().default(""),
  description: text("description").notNull().default(""),
  theme: text("theme").notNull().default("custom"), // black_friday | winter | summer | ramadan | eid | national_day | custom
  /** percent | amount (AED off the subscription per month) | free_months | trial_extension (extra trial days) */
  kind: text("kind").notNull(),
  value: numeric("value", { precision: 10, scale: 2, mode: "number" }).notNull().default(0),
  /** how many billing months the discount runs for (percent/amount); null = for as long as they stay */
  durationMonths: integer("duration_months"),
  /** plan codes the offer applies to; empty = all plans */
  planCodes: jsonb("plan_codes").$type<string[]>().notNull().default([]),
  /** billing cycles it applies to */
  cycles: jsonb("cycles").$type<string[]>().notNull().default(["monthly", "yearly"]),
  /** 'new' = new signups only, 'all' = existing shops can claim it too */
  audience: text("audience").notNull().default("new"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  maxRedemptions: integer("max_redemptions"),
  redeemedCount: integer("redeemed_count").notNull().default(0),
  /** show a banner on the home, pricing and signup pages while active */
  showBanner: boolean("show_banner").notNull().default(true),
  status: text("status").notNull().default("draft"), // draft | active | paused
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("offers_code_idx").on(sql`upper(${t.code})`).where(sql`${t.code} is not null`), index("offers_status_idx").on(t.status, t.startsAt, t.endsAt)]);

export const offerRedemptions = pgTable("offer_redemptions", {
  id: id(),
  offerId: uuid("offer_id").notNull().references(() => offers.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  planCode: text("plan_code"),
  /** snapshot of the terms at redemption, so later edits to the offer never change what a shop was promised */
  terms: jsonb("terms").$type<{ name: string; kind: string; value: number; durationMonths: number | null }>().notNull(),
  monthsRemaining: integer("months_remaining"), // null = unlimited
  totalDiscount: money("total_discount").notNull().default(0),
  status: text("status").notNull().default("active"), // active | completed | cancelled
  createdAt: createdAt(),
}, (t) => [uniqueIndex("offer_redemptions_once_idx").on(t.offerId, t.tenantId), index("offer_redemptions_tenant_idx").on(t.tenantId, t.status)]);

export const platformGateways = pgTable("platform_gateways", {
  id: id(),
  provider: text("provider").notNull().unique(), // 'stripe' | 'meta_whatsapp' (legacy rows of the retired gateway are disabled, never deleted)
  apiKeyEnc: text("api_key_enc"),
  webhookSecretEnc: text("webhook_secret_enc"),
  sandbox: boolean("sandbox").notNull().default(true),
  enabled: boolean("enabled").notNull().default(false),
  /** marketplace: does the shop (recipient) bear the gateway's processing fee? */
  recipientPaysFees: boolean("recipient_pays_fees").notNull().default(true),
  /** days the shop's share is held before payout (0 = no extra hold) */
  payoutHoldDays: integer("payout_hold_days").notNull().default(0),
  lastTestAt: timestamp("last_test_at", { withTimezone: true }),
  lastTestOk: boolean("last_test_ok"),
  /** provider-specific non-secret settings. meta_whatsapp: { appId, configId, businessId, graphVersion, lastTestMessage }.
   *  For meta_whatsapp the encrypted columns hold: apiKeyEnc = Meta APP SECRET, webhookSecretEnc = webhook VERIFY TOKEN. */
  config: jsonb("config").$type<Record<string, string>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
});

/** Shops that clicked "Connect WhatsApp" before the platform's Meta Tech Provider credentials were added ("notify me when it's ready"). */
export const whatsappActivationRequests = pgTable("whatsapp_activation_requests", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }).unique(),
  requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** One row per platform-routed order payment: what was collected, what the platform keeps, what the shop is owed (paid out from the ledger in payout batches). Reporting/reconciliation ledger — the platform does not hold shop funds itself. */
export const orderSettlements = pgTable("order_settlements", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  /** 'sale' = the paid order (one per order); 'refund' | 'chargeback' | 'chargeback_won' = append-only adjustments linked to it (net can be negative) */
  kind: text("kind").notNull().default("sale"),
  /** idempotency key for adjustments (refund id, dispute id, ...) */
  externalRef: text("external_ref"),
  gateway: text("gateway").notNull().default("mamo"),
  gatewayPaymentId: text("gateway_payment_id"),
  recipientId: text("recipient_id"),
  gross: money("gross").notNull(),
  platformFee: money("platform_fee").notNull().default(0),
  /** amount credited to the shop's recipient balance */
  shopShare: money("shop_share").notNull(),
  recipientPaysFees: boolean("recipient_pays_fees").notNull().default(true),
  /** payout ledger: fee the gateway charged, platform commission, and what the shop is owed */
  gatewayFee: money("gateway_fee").notNull().default(0),
  commission: money("commission").notNull().default(0),
  netAmount: money("net_amount").notNull().default(0),
  availableAt: timestamp("available_at", { withTimezone: true }),
  payoutItemId: uuid("payout_item_id"),
  status: text("status").notNull().default("pending"), // pending | available | batched | paid | refunded | disputed (legacy: credited)
  refundedAmount: money("refunded_amount").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("order_settlements_tenant_idx").on(t.tenantId, t.status),
  uniqueIndex("order_settlements_sale_idx").on(t.orderId).where(sql`${t.kind} = 'sale'`),
  uniqueIndex("order_settlements_ref_idx").on(t.externalRef).where(sql`${t.externalRef} is not null`),
]);

/** Gateway webhook events already processed (idempotency + replay protection). */
export const paymentWebhookEvents = pgTable("payment_webhook_events", {
  id: id(),
  provider: text("provider").notNull(),
  eventId: text("event_id").notNull(),
  type: text("type"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("payment_webhook_events_idx").on(t.provider, t.eventId)]);

/** Seller verification: trade licence + business name, reviewed by the superadmin. */
export const sellerVerifications = pgTable("seller_verifications", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }).unique(),
  legalName: text("legal_name").notNull(),
  legalNameNorm: text("legal_name_norm").notNull(),
  licenceNumber: text("licence_number").notNull(),
  licenceNumberNorm: text("licence_number_norm").notNull(),
  /** licensing authority, e.g. "Dubai Economy & Tourism", "ADDED", free zone name */
  authority: text("authority").notNull(),
  licenceExpiry: timestamp("licence_expiry", { withTimezone: true }),
  activity: text("activity"),
  signatoryName: text("signatory_name"),
  trn: text("trn"),
  /** storage key of the uploaded licence document (private file store) */
  documentKey: text("document_key"),
  status: text("status").notNull().default("pending_review"), // pending_review | verified | rejected | needs_info | expired
  reason: text("reason"),
  /** automatic review flags, e.g. ["similar_name:<tenantId>", "disposable_email", "shared_ip"] */
  flags: jsonb("flags").$type<string[]>().notNull().default([]),
  reviewerId: uuid("reviewer_id"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  history: jsonb("history").$type<{ at: string; by: string | null; status: string; note?: string }[]>().notNull().default([]),
}, (t) => [
  // the same licence / business name cannot back two live sellers
  uniqueIndex("seller_verif_licence_idx").on(t.licenceNumberNorm).where(sql`${t.status} <> 'rejected'`),
  uniqueIndex("seller_verif_name_idx").on(t.legalNameNorm).where(sql`${t.status} <> 'rejected'`),
  uniqueIndex("seller_verif_trn_idx").on(t.trn).where(sql`${t.status} <> 'rejected' and ${t.trn} is not null`),
  index("seller_verif_status_idx").on(t.status, t.submittedAt),
]);

/** Shop bank account that payouts go to. IBAN and account number are encrypted at rest. */
export const payoutAccounts = pgTable("payout_accounts", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }).unique(),
  accountHolderName: text("account_holder_name").notNull(),
  bankName: text("bank_name").notNull(),
  ibanEnc: text("iban_enc").notNull(),
  ibanLast4: text("iban_last4").notNull(),
  /** sha256 of the cleaned IBAN: one bank account cannot serve two shops */
  ibanHash: text("iban_hash").notNull(),
  accountNumberEnc: text("account_number_enc"),
  swift: text("swift"),
  status: text("status").notNull().default("pending_review"), // pending_review | verified | rejected
  reason: text("reason"),
  verifiedBy: uuid("verified_by"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  history: jsonb("history").$type<{ at: string; by: string | null; action: string; note?: string }[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("payout_accounts_iban_idx").on(t.ibanHash).where(sql`${t.status} <> 'rejected'`)]);

export const payoutBatches = pgTable("payout_batches", {
  id: id(),
  number: text("number").notNull().unique(), // PB-202611-0001
  status: text("status").notNull().default("draft"), // draft | approved | paid | cancelled
  totalAmount: money("total_amount").notNull().default(0),
  itemCount: integer("item_count").notNull().default(0),
  bankReference: text("bank_reference"),
  createdBy: uuid("created_by"),
  approvedBy: uuid("approved_by"),
  paidBy: uuid("paid_by"),
  createdAt: createdAt(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
});

export const payoutItems = pgTable("payout_items", {
  id: id(),
  batchId: uuid("batch_id").notNull().references(() => payoutBatches.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  amount: money("amount").notNull(),
  carriedForward: money("carried_forward").notNull().default(0),
  /** bank details as they were when the batch was created (never rewritten) */
  bankSnapshot: jsonb("bank_snapshot").$type<{ accountHolderName: string; bankName: string; ibanLast4: string; ibanHash: string }>().notNull(),
  settlementIds: jsonb("settlement_ids").$type<string[]>().notNull().default([]),
  status: text("status").notNull().default("pending"), // pending | paid | failed
  createdAt: createdAt(),
}, (t) => [index("payout_items_batch_idx").on(t.batchId), index("payout_items_tenant_idx").on(t.tenantId)]);

/** Terminated or banned sellers: a match on any value refuses signup / verification. Values are stored in canonical form. */
export const blocklist = pgTable("blocklist", {
  id: id(),
  kind: text("kind").notNull(), // licence | email | phone | iban_hash | card_hash | name
  value: text("value").notNull(),
  reason: text("reason").notNull(),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("blocklist_kind_value_idx").on(t.kind, t.value)]);

/** One-time / repeat walk-in customers, identified by phone number per shop. */
export const walkInCustomers = pgTable("walk_in_customers", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  phone: text("phone").notNull(), // normalised E.164, e.g. +971501234567
  name: text("name").notNull(),
  visits: integer("visits").notNull().default(0),
  totalSpent: money("total_spent").notNull().default(0),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("walk_in_customers_tenant_phone_idx").on(t.tenantId, t.phone)]);

export const orders = pgTable("orders", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  number: text("number").notNull(),
  customerId: uuid("customer_id").references(() => users.id, { onDelete: "set null" }),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone").notNull(),
  status: orderStatus("status").notNull().default("pending_payment"),
  fulfillment: fulfillmentType("fulfillment").notNull(),
  pickupLocationId: uuid("pickup_location_id").references(() => pickupLocations.id),
  deliveryAddress: jsonb("delivery_address").$type<Address>(),
  slotStart: timestamp("slot_start", { withTimezone: true }),
  slotEnd: timestamp("slot_end", { withTimezone: true }),
  deliveryProvider: text("delivery_provider"),
  deliveryRef: text("delivery_ref"),
  deliveryTrackingUrl: text("delivery_tracking_url"),
  deliveryStatus: text("delivery_status"),
  subtotal: money("subtotal").notNull(),
  deliveryFee: money("delivery_fee").notNull().default(0),
  discount: money("discount").notNull().default(0),
  vat: money("vat").notNull(),
  total: money("total").notNull(),
  currency: text("currency").notNull().default("AED"),
  paymentProvider: paymentProvider("payment_provider"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  notes: text("notes"),
  internalNotes: text("internal_notes"),
  /** 'online' (storefront) | 'walk_in' (QR queue in the shop) */
  source: text("source").notNull().default("online"),
  /** 'own' (shop's own gateway keys) | 'platform' (platform Stripe account + split to the shop) */
  paymentRoute: text("payment_route").notNull().default("own"),
  walkInCustomerId: uuid("walk_in_customer_id").references(() => walkInCustomers.id, { onDelete: "set null" }),
  ticketNo: text("ticket_no"),
  /** customer declared they own / may print the uploaded content (see src/lib/compliance.ts RIGHTS_DECLARATION_VERSION) */
  rightsDeclaredAt: timestamp("rights_declared_at", { withTimezone: true }),
  rightsDeclarationVersion: text("rights_declaration_version"),
  /** legal hold: no erasure/purge of this order's data while set */
  legalHold: boolean("legal_hold").notNull().default(false),
  /** the shop declined/cancelled the job under the acceptable-use policy */
  declinedReason: text("declined_reason"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("orders_tenant_number_idx").on(t.tenantId, t.number),
  index("orders_tenant_status_idx").on(t.tenantId, t.status),
]);

export const orderItems = pgTable("order_items", {
  id: id(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  productName: text("product_name").notNull(),
  kind: productKind("kind").notNull(),
  quantity: integer("quantity").notNull(),
  pages: integer("pages").notNull().default(1),
  selections: jsonb("selections").$type<Selections>().notNull().default({}),
  selectionLabels: jsonb("selection_labels").$type<Record<string, string>>().notNull().default({}),
  design: jsonb("design").$type<CardDesign>(),
  fileIds: jsonb("file_ids").$type<string[]>().notNull().default([]),
  unitPrice: money("unit_price").notNull(),
  lineTotal: money("line_total").notNull(),
});

/** "Request a quote" submissions from the storefront (special orders, custom gift packing, bulk). */
export const quoteRequests = pgTable("quote_requests", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  productName: text("product_name"),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  message: text("message").notNull(),
  quantity: integer("quantity"),
  selections: jsonb("selections").$type<Record<string, string>>().notNull().default({}),
  fileIds: jsonb("file_ids").$type<string[]>().notNull().default([]),
  status: text("status").notNull().default("new"), // new | replied | won | lost
  createdAt: createdAt(),
}, (t) => [index("quote_requests_tenant_idx").on(t.tenantId, t.status, t.createdAt)]);
export type QuoteRequest = typeof quoteRequests.$inferSelect;

export const orderEvents = pgTable("order_events", {
  id: id(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  message: text("message"),
  actorId: uuid("actor_id"),
  createdAt: createdAt(),
});

export const payments = pgTable("payments", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  provider: paymentProvider("provider").notNull(),
  providerRef: text("provider_ref").notNull(),
  checkoutUrl: text("checkout_url"),
  route: text("route").notNull().default("own"),
  amount: money("amount").notNull(),
  currency: text("currency").notNull().default("AED"),
  status: paymentStatus("status").notNull().default("pending"),
  raw: jsonb("raw"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("payments_provider_ref_idx").on(t.provider, t.providerRef)]);

/** Print agent installed on the shop PC. Authenticates with an API key (stored hashed). */
export const printAgents = pgTable("print_agents", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  apiKeyHash: text("api_key_hash").notNull().unique(),
  apiKeyPrefix: text("api_key_prefix").notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  printers: jsonb("printers").$type<string[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export interface PrintOptions { color: "bw" | "color"; sides: "single" | "double"; paperSize: string }

export const printJobs = pgTable("print_jobs", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  orderItemId: uuid("order_item_id").references(() => orderItems.id, { onDelete: "set null" }),
  fileId: uuid("file_id").notNull().references(() => files.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  ticketNo: text("ticket_no").notNull(),
  status: printJobStatus("status").notNull().default("awaiting_payment"),
  /** 0 normal, 1 high (e.g. small-job boost), 2 urgent (owner bump) */
  priority: integer("priority").notNull().default(0),
  copies: integer("copies").notNull().default(1),
  pages: integer("pages").notNull().default(1),
  pagesVerified: boolean("pages_verified").notNull().default(true),
  options: jsonb("options").$type<PrintOptions>().notNull(),
  printerName: text("printer_name"),
  attempts: integer("attempts").notNull().default(0),
  claimedByAgentId: uuid("claimed_by_agent_id").references(() => printAgents.id, { onDelete: "set null" }),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  queuedAt: timestamp("queued_at", { withTimezone: true }),
  error: text("error"),
  createdAt: createdAt(),
}, (t) => [
  index("print_jobs_queue_idx").on(t.tenantId, t.status, t.priority, t.queuedAt),
  index("print_jobs_order_idx").on(t.orderId),
]);

export const banners = pgTable("banners", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  title: text("title").notNull().default(""),
  subtitle: text("subtitle").notNull().default(""),
  linkUrl: text("link_url"),
  /** label of the slide's call-to-action button (shown when linkUrl is set) */
  ctaLabel: text("cta_label").notNull().default(""),
  /** offer window: slide is shown only between these dates (null = no limit) */
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  prompt: text("prompt").notNull().default(""),
  storageKey: text("storage_key").notNull(),
  mime: text("mime").notNull().default("image/png"),
  source: text("source").notNull().default("template"), // "nano-banana" | "template" | "upload"
  version: integer("version").notNull().default(1),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("banners_tenant_idx").on(t.tenantId, t.active)]);

/* ---------- WhatsApp (coexistence + AI ordering; shipped behind WHATSAPP_ENABLED) ---------- */
export const whatsappAccounts = pgTable("whatsapp_accounts", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().unique().references(() => tenants.id, { onDelete: "cascade" }),
  wabaId: text("waba_id").notNull(),
  phoneNumberId: text("phone_number_id").notNull().unique(),
  displayPhone: text("display_phone"),
  accessTokenEnc: text("access_token_enc").notNull(),
  mode: text("mode").notNull().default("coexistence"), // coexistence | cloud
  status: text("status").notNull().default("connected"), // connected | disconnected | error
  aiEnabled: boolean("ai_enabled").notNull().default(true),
  greeting: text("greeting").notNull().default(""),
  handoffMinutes: integer("handoff_minutes").notNull().default(720),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  /** embedded (Meta Embedded Signup, platform app) | manual (shop's own Meta app + system-user token) */
  connectionMethod: text("connection_method").notNull().default("embedded"),
  /** manual connect only: the shop's own app secret (encrypted) used to verify ITS webhooks, and the verify token it pastes into Meta */
  appSecretEnc: text("app_secret_enc"),
  verifyToken: text("verify_token"),
  lastWebhookAt: timestamp("last_webhook_at", { withTimezone: true }),
});

export const whatsappConversations = pgTable("whatsapp_conversations", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").notNull().references(() => whatsappAccounts.id, { onDelete: "cascade" }),
  customerWaId: text("customer_wa_id").notNull(),
  customerName: text("customer_name"),
  aiPausedUntil: timestamp("ai_paused_until", { withTimezone: true }),
  /** rate limit: AI turns used in the current 10-minute window (reserved atomically before the AI runs) */
  aiWindowStart: timestamp("ai_window_start", { withTimezone: true }),
  aiWindowCount: integer("ai_window_count").notNull().default(0),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
  /** last customer message time, drives the 24h customer-service window */
  lastCustomerMessageAt: timestamp("last_customer_message_at", { withTimezone: true }),
  refs: jsonb("refs").$type<{ cartLinks?: string[]; orderIds?: string[] }>().notNull().default({}),
  /** chat cart: items the customer has asked for in this conversation (prices re-computed server-side) */
  cart: jsonb("cart").$type<WaCartItem[]>().notNull().default([]),
  /** set when the AI failed/declined or the customer asked for a person: shows "Needs you" in the admin */
  needsHuman: boolean("needs_human").notNull().default(false),
  needsHumanReason: text("needs_human_reason"),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("wa_conv_account_customer_idx").on(t.accountId, t.customerWaId),
  index("wa_conv_tenant_last_idx").on(t.tenantId, t.lastMessageAt),
]);

export const whatsappMessages = pgTable("whatsapp_messages", {
  id: id(),
  conversationId: uuid("conversation_id").notNull().references(() => whatsappConversations.id, { onDelete: "cascade" }),
  waMessageId: text("wa_message_id"), // null for fake sends
  direction: text("direction").notNull(), // in | out
  source: text("source").notNull(), // customer | ai | business_app | admin
  type: text("type").notNull().default("text"),
  body: text("body").notNull().default(""),
  status: text("status"), // sent | delivered | read | failed
  raw: jsonb("raw"),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("wa_msg_wamid_idx").on(t.waMessageId),
  index("wa_msg_conv_idx").on(t.conversationId, t.createdAt),
]);

export const cardDesigns = pgTable("card_designs", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  design: jsonb("design").$type<CardDesign>().notNull(),
  createdAt: createdAt(),
});

/* ---------- SaaS billing ---------- */
/** Per-customer monthly counter for AI card designs (atomic reservation, see src/server/ai/card-quota.ts). subjectKey = customer id, anonymous visitor id or hashed IP. */
export const aiDesignQuota = pgTable("ai_design_quota", {
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  subjectKey: text("subject_key").notNull(),
  period: text("period").notNull(), // YYYY-MM (Asia/Dubai)
  used: integer("used").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.tenantId, t.subjectKey, t.period] })]);

/** Platform rate card for pay-as-you-go usage (AED per unit). 0 = not billed. Edited by the superadmin. */
export const usageRates = pgTable("usage_rates", {
  id: id(),
  kind: text("kind").notNull().unique(),
  priceAed: numeric("price_aed", { precision: 10, scale: 4, mode: "number" }).notNull().default(0),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Metered usage per shop. `ref` (e.g. a WhatsApp message id) makes recording idempotent so retries never double-bill. */
export const usageEvents = pgTable("usage_events", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  quantity: integer("quantity").notNull().default(1),
  tokensIn: integer("tokens_in"),
  tokensOut: integer("tokens_out"),
  /** false for owner test chats and fallbacks that cost us nothing */
  billable: boolean("billable").notNull().default(true),
  ref: text("ref"),
  meta: jsonb("meta"),
  createdAt: createdAt(),
}, (t) => [
  index("usage_events_tenant_idx").on(t.tenantId, t.kind, t.createdAt),
  uniqueIndex("usage_events_ref_idx").on(t.tenantId, t.kind, t.ref).where(sql`${t.ref} is not null`),
]);

/** One row per paid order: the commission QuickPrint earns, with the rule that produced it (immutable audit trail). */
export const orderCommissions = pgTable("order_commissions", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }).unique(),
  /** order value excluding VAT and delivery */
  basis: money("basis").notNull(),
  jobs: integer("jobs").notNull().default(1),
  pct: numeric("pct", { precision: 6, scale: 3, mode: "number" }).notNull().default(0),
  perJobFee: numeric("per_job_fee", { precision: 8, scale: 2, mode: "number" }).notNull().default(0),
  pctFee: money("pct_fee").notNull().default(0),
  jobFee: money("job_fee").notNull().default(0),
  fee: money("fee").notNull().default(0),
  minApplied: boolean("min_applied").notNull().default(false),
  maxApplied: boolean("max_applied").notNull().default(false),
  /** plan | custom | none — and the plan code at the time */
  ruleSource: text("rule_source").notNull().default("plan"),
  planCode: text("plan_code"),
  /** accrued (earned, not yet billed) | invoiced | refunded (order refunded/cancelled after payment) | waived */
  status: text("status").notNull().default("accrued"),
  invoiceId: uuid("invoice_id").references(() => saasInvoices.id, { onDelete: "set null" }),
  /** a refunded commission that was already invoiced is credited on the next invoice */
  creditedInvoiceId: uuid("credited_invoice_id").references(() => saasInvoices.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("order_commissions_tenant_idx").on(t.tenantId, t.status, t.createdAt)]);

export const saasInvoices = pgTable("saas_invoices", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  number: text("number").notNull().unique(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  subscriptionAmount: money("subscription_amount").notNull(),
  orderFeeAmount: money("order_fee_amount").notNull().default(0),
  gmv: money("gmv").notNull().default(0),
  vat: money("vat").notNull().default(0),
  total: money("total").notNull(),
  status: invoiceStatus("status").notNull().default("open"),
  stripeRef: text("stripe_ref"),
  /** which gateway collected it: stripe (older rows may hold the retired gateway's code) */
  gateway: text("gateway").notNull().default("stripe"),
  gatewayRef: text("gateway_ref"),
  paymentUrl: text("payment_url"),
  /** pay-as-you-go usage billed on this invoice (WhatsApp/Meta messages, AI) and the line detail */
  usageAmount: money("usage_amount").notNull().default(0),
  /** subscription discount from a superadmin offer (Black Friday etc.), net of VAT */
  discountAmount: money("discount_amount").notNull().default(0),
  discountDetail: jsonb("discount_detail").$type<{ offerId: string; name: string; kind: string; amount: number }[]>().notNull().default([]),
  usageDetail: jsonb("usage_detail").$type<{ kind: string; label: string; unit: string; qty: number; included: number; billedQty: number; rate: number; amount: number }[]>().notNull().default([]),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const auditLogs = pgTable("audit_logs", {
  id: id(),
  tenantId: uuid("tenant_id"),
  actorId: uuid("actor_id"),
  impersonatorId: uuid("impersonator_id"),
  action: text("action").notNull(),
  meta: jsonb("meta"),
  ip: text("ip"),
  createdAt: createdAt(),
});

/**
 * Records that a shop owner accepted the legal documents (terms, privacy, seller agreement) at a given LEGAL_VERSION.
 * Append-only evidence: the IP is stored only as a salted hash, never in clear.
 */
export const legalAcceptances = pgTable("legal_acceptances", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  /** document keys accepted, e.g. ["terms","privacy","seller-agreement"] */
  documents: jsonb("documents").$type<string[]>().notNull(),
  version: text("version").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
  ipHash: text("ip_hash"),
  userAgent: text("user_agent"),
}, (t) => [index("legal_acceptances_tenant_idx").on(t.tenantId, t.acceptedAt)]);
export type LegalAcceptance = typeof legalAcceptances.$inferSelect;


/* ---------- UAE compliance ---------- */
/** Public "report content" / takedown requests, worked by the superadmin. */
export const contentReports = pgTable("content_reports", {
  id: id(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
  /** illegal | offensive | infringes_ip | counterfeit | personal_data | other */
  category: text("category").notNull(),
  description: text("description").notNull(),
  url: text("url"),
  reporterName: text("reporter_name"),
  reporterEmail: text("reporter_email"),
  /** open | reviewing | actioned | rejected */
  status: text("status").notNull().default("open"),
  resolution: text("resolution"),
  handledBy: uuid("handled_by"),
  handledAt: timestamp("handled_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("content_reports_status_idx").on(t.status, t.createdAt)]);

/** Data-subject requests (PDPL): customers asking a shop for their data or its erasure; shop owners asking the platform. */
export const dataSubjectRequests = pgTable("data_subject_requests", {
  id: id(),
  /** shop the data belongs to; null for a request about the shop-owner's own account (handled by the platform) */
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  requesterEmail: text("requester_email").notNull(),
  /** access | erasure | correction | objection */
  kind: text("kind").notNull(),
  /** requested | in_progress | completed | rejected */
  status: text("status").notNull().default("requested"),
  note: text("note"),
  resolution: text("resolution"),
  /** response deadline (set at creation from DSR_DUE_DAYS) */
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  handledBy: uuid("handled_by"),
  createdAt: createdAt(),
}, (t) => [index("dsr_tenant_status_idx").on(t.tenantId, t.status, t.dueAt)]);

/** Security / personal-data incident register (superadmin). */
export const securityIncidents = pgTable("security_incidents", {
  id: id(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  /** low | medium | high | critical */
  severity: text("severity").notNull().default("medium"),
  /** open | contained | resolved */
  status: text("status").notNull().default("open"),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  containedAt: timestamp("contained_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  personalDataInvolved: boolean("personal_data_involved").notNull().default(false),
  dataCategories: jsonb("data_categories").$type<string[]>().notNull().default([]),
  affectedTenantIds: jsonb("affected_tenant_ids").$type<string[]>().notNull().default([]),
  affectedCount: integer("affected_count"),
  actionsTaken: text("actions_taken"),
  /** decision on notifying the regulator / affected people, with reasoning (a lawyer decides; this records it) */
  notifiedRegulatorAt: timestamp("notified_regulator_at", { withTimezone: true }),
  notifiedSubjectsAt: timestamp("notified_subjects_at", { withTimezone: true }),
  notificationDecision: text("notification_decision"),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Append-only consent / opt-in log (cookies, marketing, rights declaration). */
export const consentLogs = pgTable("consent_logs", {
  id: id(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  /** a stable subject key when there is no user (hashed email) */
  subjectKey: text("subject_key"),
  /** cookies_analytics | marketing_email | marketing_whatsapp | rights_declaration */
  purpose: text("purpose").notNull(),
  granted: boolean("granted").notNull(),
  version: text("version"),
  ipHash: text("ip_hash"),
  createdAt: createdAt(),
}, (t) => [index("consent_logs_subject_idx").on(t.tenantId, t.userId, t.purpose, t.createdAt)]);

/** Credit notes for refunded shop orders (issuer = the shop) and refunded SaaS invoices (issuer = QuickPrint). Sequential per issuer. */
export const creditNotes = pgTable("credit_notes", {
  id: id(),
  /** 'platform' or 'tenant:<tenantId>' : numbering is gapless within a scope */
  scope: text("scope").notNull(),
  seq: integer("seq").notNull(),
  number: text("number").notNull(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
  saasInvoiceId: uuid("saas_invoice_id").references(() => saasInvoices.id, { onDelete: "set null" }),
  /** the original invoice/order number being credited */
  refersTo: text("refers_to").notNull(),
  subtotal: money("subtotal").notNull(),
  vat: money("vat").notNull(),
  total: money("total").notNull(),
  currency: text("currency").notNull().default("AED"),
  reason: text("reason"),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("credit_notes_scope_seq_idx").on(t.scope, t.seq),
  uniqueIndex("credit_notes_order_total_idx").on(t.orderId, t.total).where(sql`${t.orderId} is not null`),
]);
export type ContentReport = typeof contentReports.$inferSelect;
export type DataSubjectRequest = typeof dataSubjectRequests.$inferSelect;
export type SecurityIncident = typeof securityIncidents.$inferSelect;
export type CreditNote = typeof creditNotes.$inferSelect;

/** Pre-launch waitlist: shown instead of signup in production while no live payment gateway is configured. */
export const signupWaitlist = pgTable("signup_waitlist", {
  id: id(),
  email: text("email").notNull(),
  emailCanonical: text("email_canonical").notNull(),
  shopName: text("shop_name"),
  phone: text("phone"),
  locale: text("locale").notNull().default("en"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("signup_waitlist_email_idx").on(t.emailCanonical)]);

/** Card-setup gateway events already processed (idempotency by gateway event id). */
export const gatewaySetupEvents = pgTable("gateway_setup_events", {
  eventId: text("event_id").primaryKey(),
  type: text("type").notNull(),
  tenantId: uuid("tenant_id"),
  createdAt: createdAt(),
});

export type Tenant = typeof tenants.$inferSelect;
export type Offer = typeof offers.$inferSelect;
export type OfferRedemption = typeof offerRedemptions.$inferSelect;
export type SellerVerification = typeof sellerVerifications.$inferSelect;
export type PayoutAccount = typeof payoutAccounts.$inferSelect;
export type PayoutBatch = typeof payoutBatches.$inferSelect;
export type User = typeof users.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type Banner = typeof banners.$inferSelect;
export type OrderCommission = typeof orderCommissions.$inferSelect;
export type UsageRate = typeof usageRates.$inferSelect;
export type PlatformGateway = typeof platformGateways.$inferSelect;
export type WhatsappActivationRequest = typeof whatsappActivationRequests.$inferSelect;
export type OrderSettlement = typeof orderSettlements.$inferSelect;
export type PrintJob = typeof printJobs.$inferSelect;
export type PrintAgent = typeof printAgents.$inferSelect;
export type WalkInCustomer = typeof walkInCustomers.$inferSelect;
export type WhatsappAccount = typeof whatsappAccounts.$inferSelect;
export type WhatsappConversation = typeof whatsappConversations.$inferSelect;
