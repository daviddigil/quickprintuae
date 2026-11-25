import {
  pgTable, text, integer, boolean, timestamp, jsonb, numeric, uuid, pgEnum, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { WaCartItem } from "@/server/whatsapp/cart-math";
import type { ProductConfig, TenantSettings, Selections, CardDesign, Address } from "@/lib/types";

/* ---------- enums ---------- */
export const userRole = pgEnum("user_role", ["superadmin", "owner", "staff", "customer"]);
export const tenantStatus = pgEnum("tenant_status", ["trial", "active", "past_due", "suspended", "cancelled"]);
export const productKind = pgEnum("product_kind", [
  "document", "confidential_document", "photo", "passport_photo", "photo_frame",
  "business_card", "flyer", "brochure", "notebook", "poster", "sticker", "other",
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
  status: tenantStatus("status").notNull().default("trial"),
  planId: uuid("plan_id").references(() => plans.id),
  billingCycle: text("billing_cycle").notNull().default("monthly"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  stripeCustomerId: text("stripe_customer_id"),
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
  active: boolean("active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("users_tenant_email_idx").on(sql`coalesce(${t.tenantId}::text, 'platform')`, sql`lower(${t.email})`),
]);

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
  walkInCustomerId: uuid("walk_in_customer_id").references(() => walkInCustomers.id, { onDelete: "set null" }),
  ticketNo: text("ticket_no"),
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

export type Tenant = typeof tenants.$inferSelect;
export type User = typeof users.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type Banner = typeof banners.$inferSelect;
export type PrintJob = typeof printJobs.$inferSelect;
export type PrintAgent = typeof printAgents.$inferSelect;
export type WalkInCustomer = typeof walkInCustomers.$inferSelect;
export type WhatsappAccount = typeof whatsappAccounts.$inferSelect;
export type WhatsappConversation = typeof whatsappConversations.$inferSelect;
