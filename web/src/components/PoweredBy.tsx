import { BRAND } from "@/lib/brand";

/** "Powered by Nexsofture Tech" — rendered on every surface (storefront, admin, superadmin, marketing, auth, invoices). */
export function PoweredBy({ className = "", dark = false }: { className?: string; dark?: boolean }) {
  return (
    <p data-testid="powered-by" className={`text-xs ${dark ? "text-outline" : "text-outline"} ${className}`}>
      Powered by <span className={`font-semibold ${dark ? "text-slate-200" : "text-on-surface-variant"}`}>{BRAND.company}</span>
    </p>
  );
}
