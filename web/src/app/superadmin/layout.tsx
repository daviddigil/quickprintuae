import Link from "next/link";
import { requireSuperadmin } from "@/lib/auth";

export const metadata = { title: "Super Admin" };

const NAV = [
  { href: "/superadmin", label: "Dashboard" },
  { href: "/superadmin/tenants", label: "Print shops" },
  { href: "/superadmin/plans", label: "Plans" },
  { href: "/superadmin/invoices", label: "SaaS invoices" },
  { href: "/superadmin/audit", label: "Audit log" },
  { href: "/superadmin/settings", label: "Platform health" },
];

export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireSuperadmin();
  return (
    <div className="min-h-screen lg:flex">
      <aside className="bg-slate-950 text-slate-300 lg:min-h-screen lg:w-60 lg:shrink-0">
        <div className="flex items-center justify-between px-5 py-4 lg:block">
          <Link href="/superadmin" className="text-lg font-extrabold text-white">Quick<span className="text-brand-500">Print</span> <span className="text-xs font-semibold text-slate-400">HQ</span></Link>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 text-sm lg:flex-col lg:pb-0">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-lg px-3 py-2 hover:bg-slate-800 hover:text-white">{n.label}</Link>
          ))}
        </nav>
        <div className="hidden border-t border-slate-800 px-5 py-4 text-xs lg:mt-6 lg:block">
          <p className="text-slate-400">Signed in as</p>
          <p className="truncate font-medium text-white">{user.email}</p>
          <a href="/logout?next=/login" className="mt-2 inline-block text-slate-400 hover:text-white">Sign out</a>
        </div>
      </aside>
      <main className="flex-1 p-4 sm:p-8">{children}</main>
    </div>
  );
}
