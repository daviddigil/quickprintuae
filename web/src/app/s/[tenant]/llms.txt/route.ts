import { resolveTenant } from "@/lib/tenant";
import { aed, deliveryCfg, isIndexableTenant, paymentLabels, shopCatalog, shopPlaces, storefrontUrl, trim } from "@/lib/seo/storefront";

export const dynamic = "force-dynamic";
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Machine-readable shop summary for AI assistants (llmstxt.org style). Public data only. */
export async function GET(_req: Request, ctx: { params: Promise<{ tenant: string }> }) {
  const t = await resolveTenant((await ctx.params).tenant);
  if (!t || !isIndexableTenant(t)) return new Response("Not found", { status: 404 });
  const [catalog, { pickups, zones }] = await Promise.all([shopCatalog(t), shopPlaces(t)]);
  const d = deliveryCfg(t);
  const open = DAYS.filter((_, i) => !d.closedWeekdays.includes(i));
  const pay = paymentLabels(t);
  const L = [
    `# ${t.name}`, "",
    `> ${t.name} is a print shop in ${t.emirate}, United Arab Emirates, taking online orders for printing with pickup or scheduled delivery. Prices are in AED${t.settings?.pricesIncludeVat ? " including" : " excluding"} 5% VAT.`, "",
    "Quick facts:",
    `- Location: ${[t.address, t.emirate, "UAE"].filter(Boolean).join(", ")}`,
    ...(t.phone ? [`- Phone: ${t.phone}`] : []), ...(t.whatsapp ? [`- WhatsApp: https://wa.me/${t.whatsapp.replace(/[^\d]/g, "")}`] : []),
    `- Opening hours: ${open.join(", ")} ${hh(d.openHour)}–${hh(d.closeHour)} (UAE time)`,
    ...(t.trn ? [`- VAT TRN: ${t.trn}`] : []),
    `- Payment: ${pay.length ? pay.join("; ") : "online at checkout"}. Cash on delivery is not available.`, "",
    "## Products and prices",
    ...catalog.map(({ product, from }) => `- [${product.name}](${storefrontUrl(t, `/p/${product.slug}`)}): ${trim(product.description, 160)}${from != null ? ` From ${aed(from)}.` : ""} Typical turnaround ${product.turnaroundHours >= 24 ? `${Math.round(product.turnaroundHours / 24)} day(s)` : `${product.turnaroundHours} hour(s)`}.`), "",
    "## How to order",
    `- [Shop home](${storefrontUrl(t)}): choose a product, upload files, pick options, pay online`,
    `- [Catalogue as JSON](${storefrontUrl(t, "/products.json")}): products, options and price tiers`, "",
    ...(pickups.length ? ["## Pickup", ...pickups.map((p) => `- ${p.name}: ${p.address}, ${p.emirate}. Hours: ${p.hours}`), ""] : []),
    ...(zones.length ? ["## Delivery fees by emirate", ...zones.map((z) => `- ${z.emirate}: ${aed(z.fee)}${z.freeAbove ? `, free above ${aed(z.freeAbove)}` : ""}${z.sameDay ? ", same-day available" : ""}`), ""] : []),
  ];
  return new Response(L.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, s-maxage=1800, stale-while-revalidate=86400" } });
}
