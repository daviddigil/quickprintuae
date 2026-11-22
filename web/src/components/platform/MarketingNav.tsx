import Link from "next/link";
import { PoweredBy } from "@/components/PoweredBy";

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <Link href="/" className="text-xl font-extrabold">Quick<span className="text-brand-600">Print</span><span className="ml-1 text-xs font-semibold text-slate-400">UAE</span></Link>
        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
          <Link href="/#features" className="hover:text-slate-900">Features</Link>
          <Link href="/#products" className="hover:text-slate-900">Products</Link>
          <Link href="/pricing" className="hover:text-slate-900">Pricing</Link>
          <Link href="/#faq" className="hover:text-slate-900">FAQ</Link>
          <Link href="/s/demo" className="hover:text-slate-900">Demo store</Link>
        </nav>
        <div className="flex items-center gap-2 text-sm">
          <Link href="/login" className="rounded-lg px-3 py-2 font-semibold text-slate-700 hover:bg-slate-100">Sign in</Link>
          <Link href="/signup" className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700">Start free</Link>
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 text-sm text-slate-500 sm:grid-cols-3">
        <div>
          <p className="text-lg font-extrabold text-slate-900">Quick<span className="text-brand-600">Print</span></p>
          <p className="mt-2">The online storefront and order system built for UAE print shops.</p>
        </div>
        <div className="space-y-1"><p className="font-semibold text-slate-900">Product</p><Link href="/#features" className="block">Features</Link><Link href="/pricing" className="block">Pricing</Link><Link href="/s/demo" className="block">Demo store</Link></div>
        <div className="space-y-1"><p className="font-semibold text-slate-900">Company</p><Link href="/signup" className="block">Start a free trial</Link><Link href="/login" className="block">Sign in</Link><p>Prices in AED, excl. 5% VAT.</p></div>
      </div>
      <div className="pb-8 text-center"><p className="text-xs text-slate-400">© {new Date().getFullYear()} QuickPrint UAE</p><PoweredBy className="mt-1" /></div>
    </footer>
  );
}
