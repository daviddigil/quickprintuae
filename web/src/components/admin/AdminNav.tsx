"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, ShoppingBag, Package, Truck, CreditCard, Settings, Users, Receipt, Menu, X, ExternalLink, LogOut, UserRound, Sparkles, MessageCircle, ScanLine, Inbox } from "lucide-react";
import { cn } from "@/components/ui";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { href: "/admin/walk-in", label: "Walk-in queue", icon: ScanLine, walkIn: true },
  { href: "/admin/products", label: "Products & pricing", icon: Package },
  { href: "/admin/quotes", label: "Quotes", icon: Inbox, quotes: true },
  { href: "/admin/fulfillment", label: "Pickup & delivery", icon: Truck },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
  { href: "/admin/banners", label: "Hero slider", icon: Sparkles },
  { href: "/admin/whatsapp", label: "WhatsApp AI", icon: MessageCircle },
  { href: "/admin/settings", label: "Store settings", icon: Settings },
  { href: "/admin/customers", label: "Customers", icon: UserRound },
  { href: "/admin/staff", label: "Staff", icon: Users, ownerOnly: true },
  { href: "/admin/billing", label: "Plan & billing", icon: Receipt },
];

export function AdminNav({ shopName, storeUrl, isOwner, userName, planLine, walkIn = false, newQuotes = 0 }: { shopName: string; storeUrl: string; isOwner: boolean; userName: string; planLine: string; walkIn?: boolean; newQuotes?: number }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => (!n.ownerOnly || isOwner) && (!("walkIn" in n) || walkIn));
  return (
    <>
      <div className="flex items-center justify-between border-b border-outline-variant bg-surface-lowest px-4 py-3 lg:hidden print:hidden">
        <span className="font-bold">{shopName}</span>
        <button aria-label="Menu" onClick={() => setOpen(!open)}>{open ? <X size={22} /> : <Menu size={22} />}</button>
      </div>
      <aside className={cn("w-full shrink-0 flex-col border-r border-outline-variant bg-surface-lowest lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 print:hidden", open ? "flex" : "hidden")}>
        <div className="border-b border-outline-variant px-5 py-4">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-on-surface-variant"><span aria-hidden className="grid size-6 place-items-center rounded-lg text-[10px] font-extrabold text-white" style={{ background: "linear-gradient(135deg,#00ffcc,#ff007f 50%,#3300ff)" }}>QP</span>QuickPrint Admin</p>
          <p className="mt-1 truncate font-bold">{shopName}</p>
          <p className="text-xs text-on-surface-variant">{planLine}</p>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {items.map((n) => {
            const active = n.exact ? path === n.href : path.startsWith(n.href);
            const Icon = n.icon;
            return (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)}
                className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium", active ? "bg-primary-container font-semibold text-on-primary-container" : "text-on-surface-variant hover:bg-surface-container")}>
                <Icon size={17} /> {n.label}
                {"quotes" in n && newQuotes > 0 && <span data-testid="quotes-badge" aria-label={`${newQuotes} new`} className="ms-auto min-w-6 rounded-full bg-primary px-2 text-center text-xs font-bold text-on-primary">{newQuotes}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-1 border-t border-outline-variant p-3 text-sm">
          <a href={storeUrl} target="_blank" className="flex items-center gap-2 rounded-lg px-3 py-2 text-on-surface-variant hover:bg-surface-container"><ExternalLink size={16} /> View storefront</a>
          <a href="/logout?next=/login" className="flex items-center gap-2 rounded-lg px-3 py-2 text-on-surface-variant hover:bg-surface-container"><LogOut size={16} /> Sign out ({userName})</a>
        </div>
      </aside>
    </>
  );
}
