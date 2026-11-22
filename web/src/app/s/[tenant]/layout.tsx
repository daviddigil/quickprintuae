import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { MessageCircle, Phone, User } from "lucide-react";
import { db, schema } from "@/db";
import { getCustomer } from "@/lib/auth";
import { requireStorefrontTenant } from "@/lib/tenant";
import { CartBadge } from "@/components/store/cart-badge";

type P = { params: Promise<{ tenant: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const t = await requireStorefrontTenant((await params).tenant);
  return { title: { default: `${t.name} — Online printing`, template: `%s · ${t.name}` }, description: t.settings?.heroSubtitle };
}

export default async function StoreLayout({ children, params }: P & { children: React.ReactNode }) {
  const tenant = await requireStorefrontTenant((await params).tenant);
  const [products, customer] = await Promise.all([
    db.select({ name: schema.products.name, slug: schema.products.slug }).from(schema.products)
      .where(and(eq(schema.products.tenantId, tenant.id), eq(schema.products.active, true))).orderBy(asc(schema.products.sortOrder)),
    getCustomer(tenant.id),
  ]);
  const base = `/s/${tenant.slug}`;
  const wa = tenant.whatsapp?.replace(/[^\d]/g, "");
  return (
    <div style={{ ["--store" as string]: tenant.primaryColor }} className="flex min-h-screen flex-col bg-white">
      {tenant.settings?.announcement && (
        <div className="btn-store px-4 py-2 text-center text-xs font-medium sm:text-sm">{tenant.settings.announcement}</div>
      )}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href={base} className="flex items-center gap-2 font-extrabold tracking-tight">
            {tenant.logoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={tenant.logoUrl} alt={tenant.name} className="h-9 w-auto" />
              : <span className="btn-store flex h-9 w-9 items-center justify-center rounded-lg text-lg">{tenant.name.charAt(0)}</span>}
            <span className="text-lg">{tenant.name}</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <Link href={`${base}/account`} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100">
              <User className="h-5 w-5" /><span className="hidden sm:inline">{customer ? customer.name.split(" ")[0] : "Sign in"}</span>
            </Link>
            <CartBadge store={tenant.slug} />
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2 text-sm [scrollbar-width:none]">
          {products.map((p) => (
            <Link key={p.slug} href={`${base}/p/${p.slug}`} className="whitespace-nowrap rounded-full px-3 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900">{p.name}</Link>
          ))}
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mt-16 border-t border-slate-200 bg-slate-50">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm text-slate-600 sm:grid-cols-3">
          <div>
            <p className="font-semibold text-slate-900">{tenant.legalName || tenant.name}</p>
            {tenant.address && <p className="mt-1">{tenant.address}{tenant.emirate ? `, ${tenant.emirate}` : ""}</p>}
            {tenant.trn && <p className="mt-1">TRN: {tenant.trn}</p>}
          </div>
          <div className="space-y-2">
            {tenant.phone && <a href={`tel:${tenant.phone}`} className="flex items-center gap-2 hover:text-slate-900"><Phone className="h-4 w-4" />{tenant.phone}</a>}
            {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-slate-900"><MessageCircle className="h-4 w-4" />WhatsApp us</a>}
            {tenant.email && <a href={`mailto:${tenant.email}`} className="block hover:text-slate-900">{tenant.email}</a>}
          </div>
          <div>
            <p>Secure online payment by card, Apple Pay & Google Pay. Prices in AED, VAT {tenant.settings?.vatRate ?? 5}% {tenant.settings?.pricesIncludeVat ? "included" : "added at checkout"}.</p>
            <p className="mt-2 text-xs text-slate-400">Powered by QuickPrint</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
