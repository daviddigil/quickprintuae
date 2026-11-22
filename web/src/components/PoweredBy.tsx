import { BRAND } from "@/lib/brand";

/** "Powered by Nexsofture Tech" — rendered on every surface (storefront, admin, superadmin, marketing, auth, invoices). */
export function PoweredBy({ className = "", dark = false }: { className?: string; dark?: boolean }) {
  return (
    <p data-testid="powered-by" className={`text-xs ${dark ? "text-slate-400" : "text-slate-400"} ${className}`}>
      Powered by <span className={`font-semibold ${dark ? "text-slate-200" : "text-slate-600"}`}>{BRAND.company}</span>
    </p>
  );
}
