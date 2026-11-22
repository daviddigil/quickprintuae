"use client";
import Link from "next/link";
import { FileText, Trash2 } from "lucide-react";
import { CardPreview } from "@/components/card-designer/CardDesigner";
import { LinkButton, EmptyState } from "@/components/ui";
import { useCart } from "@/lib/cart";
import { formatAED } from "@/lib/pricing";

export function CartView({ store, vatRate, pricesIncludeVat }: { store: string; vatRate: number; pricesIncludeVat: boolean }) {
  const { lines, remove, estimate } = useCart(store);
  if (!lines.length) {
    return (
      <div className="rounded-xl border border-slate-200">
        <EmptyState title="Your cart is empty">
          <p className="mt-1 text-sm">Pick a product to get started.</p>
          <LinkButton href={`/s/${store}`} variant="store" className="mt-4">Browse products</LinkButton>
        </EmptyState>
      </div>
    );
  }
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white" data-testid="cart-lines">
        {lines.map((l) => (
          <li key={l.key} className="flex gap-4 p-4">
            <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50">
              {l.design ? <CardPreview design={l.design} className="h-full w-full" /> : <FileText className="h-8 w-8 text-slate-300" />}
            </div>
            <div className="min-w-0 flex-1">
              <Link href={`/s/${store}/p/${l.productSlug}`} className="font-semibold hover:underline">{l.productName}</Link>
              <p className="text-sm text-slate-600">
                {l.pages > 1 ? `${l.pages} pages × ${l.quantity} copies` : `Qty ${l.quantity.toLocaleString()}`}
              </p>
              <p className="mt-1 truncate text-xs text-slate-500">
                {l.design ? "Custom design" : l.fileNames.length ? l.fileNames.join(", ") : ""}
              </p>
            </div>
            <div className="flex flex-col items-end justify-between">
              <span className="font-semibold">{formatAED(l.estimate)}</span>
              <button onClick={() => remove(l.key)} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" />Remove</button>
            </div>
          </li>
        ))}
      </ul>
      <aside className="h-fit rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex justify-between text-sm"><span>Subtotal</span><span className="font-semibold">{formatAED(estimate)}</span></div>
        <p className="mt-1 text-xs text-slate-500">Delivery and {vatRate}% VAT {pricesIncludeVat ? "(included in prices)" : ""} calculated at checkout.</p>
        <LinkButton href={`/s/${store}/checkout`} variant="store" className="mt-5 w-full py-3" data-testid="go-checkout">Checkout</LinkButton>
        <Link href={`/s/${store}`} className="mt-3 block text-center text-sm text-slate-600 hover:underline">Continue shopping</Link>
      </aside>
    </div>
  );
}
