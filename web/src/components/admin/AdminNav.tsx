"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, ShoppingBag, Package, Truck, CreditCard, Settings, Users, Receipt, Menu, X, ExternalLink, LogOut, UserRound, Sparkles, MessageCircle, ScanLine } from "lucide-react";
import { cn } from "@/components/ui";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { href: "/admin/walk-in", label: "Walk-in queue", icon: ScanLine, walkIn: true },
  { href: "/admin/products", label: "Products & pricing", icon: Package },
  { href: "/admin/fulfillment", label: "Pickup & delivery", icon: Truck },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
  { href: "/admin/banners", label: "Banners (AI)", icon: Sparkles },
  { href: "/admin/whatsapp", label: "WhatsApp (soon)", icon: MessageCircle },
  { href: "/admin/settings", label: "Store settings", icon: Settings },
  { href: "/admin/customers", label: "Customers", icon: UserRound },
  { href: "/admin/staff", label: "Staff", icon: Users, ownerOnly: true },
  { href: "/admin/billing", label: "Plan & billing", icon: Receipt },
];

export function AdminNav({ shopName, storeUrl, isOwner, userName, planLine, walkIn = false }: { shopName: string; storeUrl: string; isOwner: boolean; userName: string; planLine: string; walkIn?: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => (!n.ownerOnly || isOwner) && (!("walkIn" in n) || walkIn));
  return (
    <>
      <div className="flex items-center justify-between border-b bg-white px-4 py-3 lg:hidden print:hidden">
        <span className="font-bold">{shopName}</span>
        <button aria-label="Menu" onClick={() => setOpen(!open)}>{open ? <X size={22} /> : <Menu size={22} />}</button>
      </div>
      <aside className={cn("w-full shrink-0 flex-col border-r bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 print:hidden", open ? "flex" : "hidden")}>
        <div className="border-b px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Quick<span className="text-brand-600">Print</span> Admin</p>
          <p className="mt-1 truncate font-bold">{shopName}</p>
          <p className="text-xs text-slate-500">{planLine}</p>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {items.map((n) => {
            const active = n.exact ? path === n.href : path.startsWith(n.href);
            const Icon = n.icon;
            return (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)}
                className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium", active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100")}>
                <Icon size={17} /> {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-1 border-t p-3 text-sm">
          <a href={storeUrl} target="_blank" className="flex items-center gap-2 rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-100"><ExternalLink size={16} /> View storefront</a>
          <a href="/logout?next=/login" className="flex items-center gap-2 rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-100"><LogOut size={16} /> Sign out ({userName})</a>
        </div>
      </aside>
    </>
  );
}
