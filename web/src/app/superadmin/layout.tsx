import Link from "next/link";
import { requireSuperadmin } from "@/lib/auth";
import { PoweredBy } from "@/components/PoweredBy";

export const metadata = { title: "Super Admin" };

const NAV = [
  { href: "/superadmin", label: "Dashboard" },
  { href: "/superadmin/tenants", label: "Print shops" },
  { href: "/superadmin/plans", label: "Plans" },
  { href: "/superadmin/commissions", label: "Commissions" },
  { href: "/superadmin/usage", label: "Usage billing" },
  { href: "/superadmin/verifications", label: "Verifications" },
  { href: "/superadmin/payouts", label: "Payouts" },
  { href: "/superadmin/gateways", label: "Payment gateways" },
  { href: "/superadmin/invoices", label: "SaaS invoices" },
  { href: "/superadmin/audit", label: "Audit log" },
  { href: "/superadmin/security", label: "Security" },
  { href: "/superadmin/settings", label: "Platform health" },
];

export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireSuperadmin();
  return (
    <div className="min-h-screen lg:flex">
      <aside className="bg-inverse-surface text-inverse-on-surface/75 lg:min-h-screen lg:w-60 lg:shrink-0">
        <div className="flex items-center justify-between px-5 py-4 lg:block">
          <Link href="/superadmin" className="flex items-center gap-2 text-lg font-extrabold text-white"><span aria-hidden className="grid size-7 place-items-center rounded-lg text-[11px] font-extrabold" style={{ background: "linear-gradient(135deg,#00ffcc,#ff007f 50%,#3300ff)" }}>QP</span>QuickPrint <span className="text-xs font-semibold text-[#00ffcc]">HQ</span></Link>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 text-sm lg:flex-col lg:pb-0">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-lg px-3 py-2 hover:bg-white/10 hover:text-white">{n.label}</Link>
          ))}
        </nav>
        <div className="hidden border-t border-white/10 px-5 py-4 text-xs lg:mt-6 lg:block">
          <p className="text-inverse-on-surface/60">Signed in as</p>
          <p className="truncate font-medium text-white">{user.email}</p>
          <a href="/logout?next=/login" className="mt-2 inline-block text-inverse-on-surface/60 hover:text-white">Sign out</a>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col"><main className="flex-1 p-4 sm:p-8">{children}</main><PoweredBy className="pb-4 text-center" /></div>
    </div>
  );
}
