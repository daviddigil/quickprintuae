import "server-only";
import type { Order, Tenant } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { markOrderPaid } from "@/server/orders";

/**
 * Mamo Pay Business API (UAE).
 * NOTE: docs.mamopay.com was not reachable while building; field names follow Mamo's published
 * "Payment Links" API (POST /links → { id, payment_url }, GET /links/{id}, GET /charges). Parsing is
 * defensive and every success is double-checked by re-fetching from the API — never trust webhook bodies.
 */
export const MAMO_BASE = {
  live: process.env.MAMO_API_BASE ?? "https://business.mamopay.com/manage_api/v1",
  sandbox: process.env.MAMO_SANDBOX_API_BASE ?? "https://sandbox.dev.business.mamopay.com/manage_api/v1",
};

type Json = Record<string, unknown>;

export function mamoConfig(tenant: Tenant) {
  const m = tenant.settings.payments?.mamo;
  const apiKey = decrypt(m?.apiKeyEnc);
  if (!apiKey) throw new Error("Mamo Pay is not configured for this store");
  return { apiKey, base: m?.sandbox ? MAMO_BASE.sandbox : MAMO_BASE.live };
}

async function mamoFetch(cfg: { apiKey: string; base: string }, path: string, init: RequestInit = {}): Promise<Json> {
  const res = await fetch(`${cfg.base}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json", Accept: "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const text = await res.text();
  let body: Json = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!res.ok) {
    const msg = (body.messages as string[] | undefined)?.join(", ") ?? (body.error as string) ?? (body.message as string) ?? res.statusText;
    throw new Error(`Mamo Pay ${res.status}: ${msg}`);
  }
  return body;
}

export async function createMamoCheckout(tenant: Tenant, order: Order, urls: { successUrl: string; cancelUrl: string }) {
  const cfg = mamoConfig(tenant);
  const link = await mamoFetch(cfg, "/links", {
    method: "POST",
    body: JSON.stringify({
      title: `${tenant.name} – Order ${order.number}`.slice(0, 75),
      description: `Print order ${order.number}`,
      amount: order.total,
      amount_currency: "AED",
      return_url: urls.successUrl,
      failure_return_url: urls.cancelUrl,
      is_widget: false,
      enable_tabby: false,
      enable_message: false,
      enable_tips: false,
      enable_customer_details: false,
      first_name: order.customerName.split(" ")[0],
      last_name: order.customerName.split(" ").slice(1).join(" ") || undefined,
      email: order.customerEmail,
      custom_data: { order_id: order.id, tenant_id: tenant.id, order_number: order.number },
      external_id: order.id,
    }),
  });
  const id = String(link.id ?? "");
  const url = String(link.payment_url ?? link.url ?? "");
  if (!id || !url) throw new Error("Mamo Pay did not return a payment link");
  return { url, providerRef: id };
}

const PAID = new Set(["captured", "succeeded", "paid", "completed", "success"]);

/** Re-fetch charges for the payment link and mark paid if a captured charge matches the order amount. */
export async function verifyMamo(tenant: Tenant, order: Order, linkId: string) {
  const cfg = mamoConfig(tenant);
  const charges: Json[] = [];
  try {
    const link = await mamoFetch(cfg, `/links/${encodeURIComponent(linkId)}`);
    for (const k of ["charges", "transactions", "payments"]) if (Array.isArray(link[k])) charges.push(...(link[k] as Json[]));
  } catch { /* fall through to charges listing */ }
  if (!charges.length) {
    try {
      const list = await mamoFetch(cfg, `/charges?payment_link_id=${encodeURIComponent(linkId)}`);
      const arr = (Array.isArray(list.data) ? list.data : Array.isArray(list) ? list : []) as Json[];
      charges.push(...arr);
    } catch { /* ignore */ }
  }
  const match = charges.find((c) => {
    const status = String(c.status ?? "").toLowerCase();
    const amount = Number(c.amount ?? c.amount_captured ?? 0);
    const linkRef = c.payment_link_id ?? c.link_id ?? (c.payment_link as Json | undefined)?.id ?? linkId;
    return PAID.has(status) && Math.abs(amount - order.total) < 0.01 && String(linkRef) === linkId;
  });
  if (!match) return false;
  await markOrderPaid(order.id, "mamo", linkId, { chargeId: match.id, status: match.status, amount: match.amount });
  return true;
}

/** Look up a charge by id (used by webhook). Returns the link id it belongs to when paid. */
export async function fetchMamoCharge(tenant: Tenant, chargeId: string) {
  const cfg = mamoConfig(tenant);
  return mamoFetch(cfg, `/charges/${encodeURIComponent(chargeId)}`);
}

export async function testMamoKey(apiKey: string, sandbox: boolean) {
  const cfg = { apiKey, base: sandbox ? MAMO_BASE.sandbox : MAMO_BASE.live };
  await mamoFetch(cfg, "/links?page=1&per_page=1");
  return { ok: true as const, account: sandbox ? "Mamo sandbox" : "Mamo live", livemode: !sandbox };
}
