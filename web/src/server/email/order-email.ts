import { esc, layout, type Rendered } from "./templates";
import { sellerIdentityLines, type SellerIdentity } from "@/lib/seller-identity";
import { resolveReturnsPolicy } from "@/lib/consumer-terms";

/** Order confirmation sent when payment is received. Carries the verified seller identity and the shop's consumer terms. */
export function orderConfirmationEmail(o: {
  shopName: string; customerName: string; orderNumber: string; total: number; vat: number; currency?: string;
  seller: SellerIdentity | null; returnsPolicy?: string | null; url: string;
}): Rendered {
  const cur = o.currency ?? "AED";
  const amt = (n: number) => `${cur} ${n.toFixed(2)}`;
  const sold = sellerIdentityLines(o.seller, o.shopName);
  const policy = resolveReturnsPolicy(o.returnsPolicy, "en").text;
  const head = `Order ${o.orderNumber} confirmed`;
  const line = `Thank you, ${o.customerName}. ${o.shopName} has received your payment of ${amt(o.total)} (includes VAT ${amt(o.vat)}).`;
  const p = (t: string) => `<p style="margin:0 0 12px">${esc(t)}</p>`;
  const html = layout({
    title: head, preheader: line.slice(0, 90), footerNote: `This order was placed with ${o.shopName} through QuickPrint UAE.`,
    bodyHtml: `<h1 style="margin:0 0 16px;font-size:22px;color:#1D1E3A">${esc(head)}</h1>${p(line)}`
      + `<p style="margin:16px 0"><a href="${esc(o.url)}" style="display:inline-block;background:#3300FF;color:#fff;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:8px">View your order</a></p>`
      + `<div data-seller-identity style="margin:20px 0;padding:12px;background:#f4f5f9;border-radius:8px;font-size:13px">${sold.map((l) => `<div>${esc(l)}</div>`).join("")}</div>`
      + `<p style="margin:16px 0 4px;font-weight:700;font-size:14px">Cancellation, returns and delivery</p><div style="font-size:13px;color:#5b5d7a">${policy.map(p).join("")}</div>`,
  });
  return {
    subject: `Order ${o.orderNumber} confirmed`,
    text: `${head}\n\n${line}\n\nView your order: ${o.url}\n\n${sold.join("\n")}\n\nCancellation, returns and delivery\n${policy.join("\n")}\n`,
    html,
  };
}
