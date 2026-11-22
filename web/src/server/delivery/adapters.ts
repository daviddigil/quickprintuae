/**
 * Courier adapters.
 *
 * IMPORTANT: none of the aggregator APIs below could be verified against live documentation while
 * building (developer portals were unreachable from the build environment). Each adapter isolates
 * the endpoint + payload mapping in one place, base URLs are overridable by env, and responses are
 * parsed defensively. Verify against the provider's sandbox before going live. With no API key, or
 * DELIVERY_FAKE=1, adapters simulate success so the end-to-end flow is demoable.
 */
import type { DeliveryAdapter, ShipmentContext, ProviderConfig, ShipmentResult } from "./types";
import { normaliseStatus } from "./types";
import { fakeRef, jsonFetch, pick, requireKey } from "./http";

const simulate = (prefix: string, ctx: ShipmentContext, trackingBase?: string): ShipmentResult => {
  const ref = fakeRef(prefix);
  return { ref, status: "created", trackingUrl: trackingBase ? `${trackingBase}${ref}` : undefined, raw: { simulated: true, order: ctx.order.number } };
};

const fullAddress = (ctx: ShipmentContext) =>
  [ctx.dropoff.line1, ctx.dropoff.line2, ctx.dropoff.area, ctx.dropoff.city, ctx.dropoff.emirate].filter(Boolean).join(", ");

const codZero = 0; // platform policy: prepaid only, no cash on delivery

/* ---------- In-house drivers: no external API ---------- */
export const inhouse: DeliveryAdapter = {
  code: "inhouse", name: "In-house drivers",
  async createShipment(ctx) {
    return { ref: `IH-${ctx.order.number}`, status: "assigned" };
  },
  async getStatus() {
    // status is driven by staff in the admin panel / driver webhook
    return { status: "assigned" };
  },
};

/* ---------- Manual / other courier: staff types a tracking number ---------- */
export const manual: DeliveryAdapter = {
  code: "manual", name: "Other / manual tracking",
  async createShipment(ctx) {
    return { ref: `MAN-${ctx.order.number}`, status: "created" };
  },
  async getStatus() { return { status: "created" }; },
};

/* ---------- Jeebly (UAE last-mile aggregator) ---------- */
const JEEBLY_BASE = (cfg: ProviderConfig) =>
  process.env.JEEBLY_API_BASE ?? (cfg.sandbox ? "https://demo.jeebly.com/app/api" : "https://app.jeebly.com/app/api");
export const jeebly: DeliveryAdapter = {
  code: "jeebly", name: "Jeebly",
  async createShipment(ctx) {
    if (ctx.cfg.fake) return simulate("JBL", ctx, "https://jeebly.com/track-shipment?awb=");
    const key = requireKey(ctx.cfg, "Jeebly");
    const body = await jsonFetch(`${JEEBLY_BASE(ctx.cfg)}/create_shipment`, {
      method: "POST",
      headers: { "X-API-KEY": key, ...(ctx.cfg.accountId ? { client_key: ctx.cfg.accountId } : {}) },
      body: JSON.stringify({
        delivery_type: "Next Day",
        load_type: "Non-document",
        consignment_type: "FORWARD",
        description: ctx.description,
        weight: 0.5 * ctx.parcelCount,
        payment_type: "Prepaid",
        cod_amount: codZero,
        num_pieces: ctx.parcelCount,
        customer_reference_number: ctx.order.number,
        origin_address_name: ctx.pickup.name,
        origin_address_mob_no_country_code: "971",
        origin_address_mobile_number: ctx.pickup.phone.replace(/\D/g, "").replace(/^971/, ""),
        origin_address_line1: ctx.pickup.address,
        origin_address_city: ctx.pickup.emirate,
        destination_address_name: ctx.dropoff.name,
        destination_address_mob_no_country_code: "971",
        destination_address_mobile_number: ctx.dropoff.phone.replace(/\D/g, "").replace(/^971/, ""),
        destination_address_line1: fullAddress(ctx),
        destination_address_city: ctx.dropoff.emirate,
        pickup_date: (ctx.order.slotStart ?? new Date()).toISOString().slice(0, 10),
      }),
    });
    const ref = String(pick(body, "AWB No", "awb_no", "awb", "data.awb", "shipment_id", "data.shipment_id") ?? "");
    if (!ref) throw new Error("Jeebly did not return an AWB number");
    return { ref, status: "created", trackingUrl: `https://jeebly.com/track-shipment?awb=${ref}`, raw: body };
  },
  async getStatus(ref, cfg) {
    if (cfg.fake) return { status: "created" };
    const body = await jsonFetch(`${JEEBLY_BASE(cfg)}/shipment/track`, {
      method: "POST", headers: { "X-API-KEY": requireKey(cfg, "Jeebly"), ...(cfg.accountId ? { client_key: cfg.accountId } : {}) },
      body: JSON.stringify({ awb_no: ref }),
    });
    return { status: normaliseStatus(pick(body, "status", "data.status", "Tracking.0.status", "shipment_status")), raw: body };
  },
  async cancel(ref, cfg) {
    if (cfg.fake) return;
    await jsonFetch(`${JEEBLY_BASE(cfg)}/shipment/cancel`, {
      method: "POST", headers: { "X-API-KEY": requireKey(cfg, "Jeebly") }, body: JSON.stringify({ awb_no: ref, reason: "Cancelled by merchant" }),
    });
  },
};

/* ---------- Quiqup (UAE on-demand & scheduled delivery) ---------- */
const QUIQUP_BASE = (cfg: ProviderConfig) =>
  process.env.QUIQUP_API_BASE ?? (cfg.sandbox ? "https://platform-api.staging.quiqup.com" : "https://platform-api.quiqup.com");
async function quiqupToken(cfg: ProviderConfig) {
  // apiKey holds "client_id:client_secret" (OAuth2 client credentials)
  const [client_id, client_secret] = requireKey(cfg, "Quiqup").split(":");
  if (!client_secret) return client_id; // already a bearer token
  const body = await jsonFetch(`${QUIQUP_BASE(cfg)}/oauth/token`, {
    method: "POST", body: JSON.stringify({ grant_type: "client_credentials", client_id, client_secret }),
  });
  return String(body.access_token ?? "");
}
export const quiqup: DeliveryAdapter = {
  code: "quiqup", name: "Quiqup",
  async createShipment(ctx) {
    if (ctx.cfg.fake) return simulate("QQP", ctx, "https://www.quiqup.com/track/");
    const token = await quiqupToken(ctx.cfg);
    const body = await jsonFetch(`${QUIQUP_BASE(ctx.cfg)}/api/fulfilment/orders`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        kind: ctx.order.slotStart ? "partner_same_day" : "partner_next_day",
        partner_order_id: ctx.order.number,
        payment_mode: "pre_paid",
        payment_amount: codZero,
        scheduled_for: ctx.order.slotStart?.toISOString(),
        origin: { contact_name: ctx.pickup.name, contact_phone: ctx.pickup.phone, address: { address1: ctx.pickup.address, town: ctx.pickup.emirate, country: "AE" } },
        destination: {
          contact_name: ctx.dropoff.name, contact_phone: ctx.dropoff.phone, notes: ctx.dropoff.notes,
          address: { address1: ctx.dropoff.line1, address2: ctx.dropoff.line2, town: ctx.dropoff.area, city: ctx.dropoff.emirate, country: "AE", coords: ctx.dropoff.lat ? [ctx.dropoff.lng, ctx.dropoff.lat] : undefined },
        },
        items: [{ name: ctx.description, quantity: ctx.parcelCount }],
      }),
    });
    const ref = String(pick(body, "id", "order.id", "data.id") ?? "");
    if (!ref) throw new Error("Quiqup did not return an order id");
    return { ref, status: normaliseStatus(pick(body, "state", "order.state")), trackingUrl: String(pick(body, "tracking_url", "order.tracking_url") ?? "") || undefined, raw: body };
  },
  async getStatus(ref, cfg) {
    if (cfg.fake) return { status: "created" };
    const token = await quiqupToken(cfg);
    const body = await jsonFetch(`${QUIQUP_BASE(cfg)}/api/fulfilment/orders/${encodeURIComponent(ref)}`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: normaliseStatus(pick(body, "state", "order.state", "status")), trackingUrl: String(pick(body, "tracking_url") ?? "") || undefined, raw: body };
  },
  async cancel(ref, cfg) {
    if (cfg.fake) return;
    const token = await quiqupToken(cfg);
    await jsonFetch(`${QUIQUP_BASE(cfg)}/api/fulfilment/orders/${encodeURIComponent(ref)}/cancel`, { method: "PUT", headers: { Authorization: `Bearer ${token}` } });
  },
};

/* ---------- Careem Box (Careem's parcel service) ---------- */
const CAREEM_BASE = () => process.env.CAREEM_BOX_API_BASE ?? "https://box-api.careem.com/v1";
export const careem_box: DeliveryAdapter = {
  code: "careem_box", name: "Careem Box",
  async createShipment(ctx) {
    if (ctx.cfg.fake) return simulate("CBX", ctx);
    const body = await jsonFetch(`${CAREEM_BASE()}/deliveries`, {
      method: "POST", headers: { Authorization: `Bearer ${requireKey(ctx.cfg, "Careem Box")}` },
      body: JSON.stringify({
        reference: ctx.order.number,
        pickup: { name: ctx.pickup.name, phone: ctx.pickup.phone, address: ctx.pickup.address, city: ctx.pickup.emirate },
        dropoff: { name: ctx.dropoff.name, phone: ctx.dropoff.phone, address: fullAddress(ctx), city: ctx.dropoff.emirate, lat: ctx.dropoff.lat, lng: ctx.dropoff.lng },
        scheduled_at: ctx.order.slotStart?.toISOString(),
        package: { description: ctx.description, count: ctx.parcelCount, size: "small" },
        cash_collection: codZero,
      }),
    });
    const ref = String(pick(body, "id", "delivery_id", "data.id") ?? "");
    if (!ref) throw new Error("Careem Box did not return a delivery id");
    return { ref, status: normaliseStatus(pick(body, "status")), trackingUrl: String(pick(body, "tracking_url") ?? "") || undefined, raw: body };
  },
  async getStatus(ref, cfg) {
    if (cfg.fake) return { status: "created" };
    const body = await jsonFetch(`${CAREEM_BASE()}/deliveries/${encodeURIComponent(ref)}`, { headers: { Authorization: `Bearer ${requireKey(cfg, "Careem Box")}` } });
    return { status: normaliseStatus(pick(body, "status", "data.status")), raw: body };
  },
};

/* ---------- Aramex (JSON Shipping Services API) ---------- */
const ARAMEX_BASE = (cfg: ProviderConfig) =>
  process.env.ARAMEX_API_BASE ?? (cfg.sandbox ? "https://ws.dev.aramex.net/ShippingAPI.V2" : "https://ws.aramex.net/ShippingAPI.V2");
/** apiKey holds "username:password:accountPin:accountEntity" ; accountId = Aramex account number. */
function aramexClientInfo(cfg: ProviderConfig) {
  const [UserName, Password, AccountPin, AccountEntity = "DXB"] = requireKey(cfg, "Aramex").split(":");
  return { UserName, Password, Version: "v1.0", AccountNumber: cfg.accountId ?? "", AccountPin, AccountEntity, AccountCountryCode: "AE", Source: 24 };
}
const aramexParty = (name: string, phone: string, line1: string, city: string, email = "") => ({
  PartyAddress: { Line1: line1, City: city, CountryCode: "AE" },
  Contact: { PersonName: name, CompanyName: name, PhoneNumber1: phone, CellPhone: phone, EmailAddress: email },
});
export const aramex: DeliveryAdapter = {
  code: "aramex", name: "Aramex",
  async createShipment(ctx) {
    if (ctx.cfg.fake) return simulate("ARX", ctx, "https://www.aramex.com/ae/en/track/results?ShipmentNumber=");
    const body = await jsonFetch(`${ARAMEX_BASE(ctx.cfg)}/Shipping/Service_1_0.svc/json/CreateShipments`, {
      method: "POST",
      body: JSON.stringify({
        ClientInfo: aramexClientInfo(ctx.cfg),
        Transaction: { Reference1: ctx.order.number },
        Shipments: [{
          Reference1: ctx.order.number,
          Shipper: { ...aramexParty(ctx.pickup.name, ctx.pickup.phone, ctx.pickup.address, ctx.pickup.emirate), AccountNumber: ctx.cfg.accountId },
          Consignee: aramexParty(ctx.dropoff.name, ctx.dropoff.phone, fullAddress(ctx), ctx.dropoff.emirate, ctx.order.customerEmail),
          ShippingDateTime: `/Date(${Date.now()})/`,
          Details: {
            ActualWeight: { Unit: "KG", Value: 0.5 * ctx.parcelCount },
            ProductGroup: "DOM", ProductType: "CDS", PaymentType: "P",
            NumberOfPieces: ctx.parcelCount, DescriptionOfGoods: ctx.description, GoodsOriginCountry: "AE",
          },
        }],
        LabelInfo: { ReportID: 9201, ReportType: "URL" },
      }),
    });
    if (body.HasErrors) throw new Error(`Aramex: ${JSON.stringify(pick(body, "Notifications", "Shipments.0.Notifications")).slice(0, 200)}`);
    const ref = String(pick(body, "Shipments.0.ID") ?? "");
    if (!ref) throw new Error("Aramex did not return a shipment number");
    return { ref, status: "created", trackingUrl: `https://www.aramex.com/ae/en/track/results?ShipmentNumber=${ref}`, raw: body };
  },
  async getStatus(ref, cfg) {
    if (cfg.fake) return { status: "created" };
    const body = await jsonFetch(`${ARAMEX_BASE(cfg)}/Tracking/Service_1_0.svc/json/TrackShipments`, {
      method: "POST", body: JSON.stringify({ ClientInfo: aramexClientInfo(cfg), Shipments: [ref], GetLastTrackingUpdateOnly: true }),
    });
    const last = pick(body, "TrackingResults.0.Value.0.UpdateDescription", "TrackingResults.0.Value.0.UpdateCode");
    return { status: normaliseStatus(last), raw: body };
  },
};

export const ADAPTERS: Record<string, DeliveryAdapter> = { inhouse, manual, jeebly, quiqup, careem_box, aramex };
