import Link from "next/link";
import { MarketingFooter, MarketingNav } from "@/components/platform/MarketingNav";
import { ReportForm } from "@/components/platform/ReportForm";
import type { Locale } from "@/lib/i18n";

const C = {
  en: { h1: "Report content", lead: "Use this form to report content, an order or a shop that breaks the law or our Acceptable Use Policy, or that infringes your rights. We review every report.", policy: "Read the Acceptable Use Policy", policyHref: "/acceptable-use" },
  ar: { h1: "الإبلاغ عن محتوى", lead: "استخدم هذا النموذج للإبلاغ عن محتوى أو طلب أو متجر يخالف القانون أو سياسة الاستخدام المقبول أو ينتهك حقوقك. نراجع كل بلاغ.", policy: "اقرأ سياسة الاستخدام المقبول", policyHref: "/ar/acceptable-use" },
} as const;

export function ReportPage({ locale }: { locale: Locale }) {
  const c = C[locale];
  return (
    <div className="theme-auto min-h-screen">
      <MarketingNav locale={locale} />
      <main id="main">
        <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 md:py-16">
          <h1 className="font-display text-display font-bold">{c.h1}</h1>
          <p className="measure mt-4 text-on-surface-variant">{c.lead}</p>
          <p className="mt-2"><Link href={c.policyHref} className="text-sm underline underline-offset-2">{c.policy}</Link></p>
          <div className="mt-8"><ReportForm locale={locale} /></div>
        </div>
      </main>
      <MarketingFooter locale={locale} />
    </div>
  );
}
