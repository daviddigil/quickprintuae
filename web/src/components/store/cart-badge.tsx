"use client";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/lib/cart";

export function CartBadge({ store }: { store: string }) {
  const { count } = useCart(store);
  return (
    <Link href={`/s/${store}/cart`} className="relative inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium hover:bg-surface-container" aria-label={`Cart, ${count} items`}>
      <ShoppingCart className="h-5 w-5" />
      <span className="hidden sm:inline">Cart</span>
      {count > 0 && (
        <span data-testid="cart-count" className="btn-store absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold">{count}</span>
      )}
    </Link>
  );
}
