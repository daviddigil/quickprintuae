"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { NOTICE_COOKIE, analyticsAllowed, readCookie, writeCookie } from "@/lib/cookie-consent";

const T = {
  en: { text: "We only use essential cookies (to keep you signed in and your cart). No tracking or advertising cookies.", more: "Learn more", ok: "Got it", aria: "Cookie notice", href: "/privacy" },
  ar: { text: "نستخدم ملفات تعريف الارتباط الأساسية فقط (لإبقائك مسجّلاً ولحفظ سلتك). لا نستخدم ملفات تتبّع أو إعلانات.", more: "اعرف المزيد", ok: "حسناً", aria: "إشعار ملفات تعريف الارتباط", href: "/ar/privacy" },
} as const;

/** React hook for future analytics code: false until the visitor opts in. */
export function useAnalyticsConsent() {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(analyticsAllowed()), []);
  return on;
}

export function CookieNotice({ locale }: { locale: "en" | "ar" }) {
  const t = T[locale];
  const [show, setShow] = useState(false);
  useEffect(() => { setShow(readCookie(NOTICE_COOKIE) === null); }, []);
  if (!show) return null;
  function dismiss() {
    writeCookie(NOTICE_COOKIE, "1");
    setShow(false);
    // records the decision against the signed-in user when there is one (the server ignores anonymous calls)
    void fetch("/api/v1/consent/cookies", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ analytics: false }) }).catch(() => {});
  }
  return (
    <div role="region" aria-label={t.aria} data-testid="cookie-notice" className="fixed inset-x-3 bottom-3 z-40 rounded-shape-lg border border-outline-variant bg-surface-lowest p-4 text-sm text-on-surface shadow-elev-3 sm:inset-x-auto sm:end-4 sm:max-w-sm print:hidden">
      <p>{t.text} <Link href={t.href} className="font-semibold underline underline-offset-2">{t.more}</Link></p>
      <button type="button" onClick={dismiss} className="mt-3 inline-flex min-h-11 items-center rounded-shape-md bg-primary px-5 font-semibold text-on-primary">{t.ok}</button>
    </div>
  );
}
