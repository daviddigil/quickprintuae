"use client";
import { useState } from "react";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { TurnstileWidget } from "@/components/security/TurnstileWidget";
import { REPORT_CATEGORIES } from "@/lib/compliance";

const T = {
  en: {
    cat: "What is the problem?", desc: "Describe it", descHint: "(what, where, and why it breaks the policy)", url: "Link or page (optional)", order: "Order number (optional)",
    name: "Your name (optional)", email: "Your email (optional, so we can reply)", send: "Send report", sending: "Sending...", done: "Thank you. Your report was received and will be reviewed.",
    fail: "Could not send the report. Please try again.",
    cats: { illegal: "Unlawful content", offensive: "Hateful or offensive content", infringes_ip: "Infringes my rights (copyright, trademark, design)", counterfeit: "Counterfeit or forged item (including IDs)", personal_data: "Shows personal data without permission", other: "Something else" },
  },
  ar: {
    cat: "ما المشكلة؟", desc: "صف المشكلة", descHint: "(ماذا ولماذا تخالف السياسة)", url: "رابط أو صفحة (اختياري)", order: "رقم الطلب (اختياري)",
    name: "اسمك (اختياري)", email: "بريدك الإلكتروني (اختياري للرد عليك)", send: "إرسال البلاغ", sending: "جارٍ الإرسال...", done: "شكراً لك. تم استلام بلاغك وسيتم النظر فيه.",
    fail: "تعذّر إرسال البلاغ. يرجى المحاولة مرة أخرى.",
    cats: { illegal: "محتوى مخالف للقانون", offensive: "محتوى يحرّض على الكراهية أو مسيء", infringes_ip: "ينتهك حقوقي (حقوق نشر أو علامة تجارية أو تصميم)", counterfeit: "مادة مقلّدة أو مزوّرة (بما فيها الهويات)", personal_data: "يعرض بيانات شخصية دون إذن", other: "شيء آخر" },
  },
} as const;

export function ReportForm({ locale }: { locale: "en" | "ar" }) {
  const t = T[locale];
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErr(null); setState("busy");
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/v1/report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...Object.fromEntries(fd.entries()), turnstileToken: captcha ?? undefined }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error ?? t.fail); setState("idle"); setRound((r) => r + 1); setCaptcha(null); return; }
    setState("done");
  }
  if (state === "done") return <div role="status" data-testid="report-done"><Alert tone="green">{t.done}</Alert></div>;
  return (
    <form onSubmit={submit} className="space-y-4" data-testid="report-form">
      {err && <div role="alert"><Alert>{err}</Alert></div>}
      <Field label={t.cat}>
        <Select name="category" required defaultValue="">
          <option value="" disabled>-</option>
          {REPORT_CATEGORIES.map((c) => <option key={c} value={c}>{t.cats[c]}</option>)}
        </Select>
      </Field>
      <Field label={t.desc} hint={t.descHint}><Textarea name="description" required minLength={10} maxLength={3000} rows={5} /></Field>
      <Field label={t.url}><Input name="url" maxLength={500} inputMode="url" /></Field>
      <Field label={t.order}><Input name="orderNumber" maxLength={60} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.name}><Input name="reporterName" maxLength={120} autoComplete="name" /></Field>
        <Field label={t.email}><Input name="reporterEmail" type="email" maxLength={200} autoComplete="email" /></Field>
      </div>
      <div aria-hidden className="absolute -start-[9999px] h-0 w-0 overflow-hidden"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <TurnstileWidget key={round} onToken={setCaptcha} />
      <Button disabled={state === "busy"}>{state === "busy" ? t.sending : t.send}</Button>
    </form>
  );
}
