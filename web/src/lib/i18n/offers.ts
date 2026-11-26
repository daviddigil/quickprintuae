/** Offer copy (en + ar) kept apart from en.ts/ar.ts. The typed parity check below fails the build if the two drift. */
import type { OfferLike, OfferTheme } from "@/lib/offers";

export interface OfferCopy {
  endsOn: string; endsIn: string; endsToday: string; days: string; hours: string; minutes: string; code: string; cta: string; badge: string;
  was: string; now: string; firstPeriod: string; promoLabel: string; promoHint: string; apply: string; applied: string; autoApplied: string; remove: string;
  failures: { invalid: string; expired: string; sold_out: string; not_applicable: string; rate: string };
  themeHeadline: Record<Exclude<OfferTheme, "custom">, string>;
  kind: { percent: string; amount: string; free_months: string; trial_extension: string };
  months: (n: number) => string;
  monthsFree: (n: number) => string;
  extraDays: (n: number) => string;
  after: string; // "then the regular price"
  claimTitle: string; claimLead: string; claim: string; claimed: string; claimFail: string;
}

const EN: OfferCopy = {
  endsOn: "Ends {date}", endsIn: "Ends in {time}", endsToday: "Ends today", days: "d", hours: "h", minutes: "m", code: "Code", cta: "Claim this offer", badge: "Limited offer",
  was: "Regular price", now: "With offer", firstPeriod: "first payment", promoLabel: "Promo code (optional)", promoHint: "Have a code? Enter it to see your discount.",
  apply: "Apply", applied: "Offer applied", autoApplied: "Offer applied automatically", remove: "Remove",
  failures: { invalid: "That promo code isn't valid. Check the spelling and try again.", expired: "This offer is no longer available.", sold_out: "This offer has been fully claimed.", not_applicable: "This code doesn't apply to the plan or billing cycle you chose.", rate: "Too many attempts. Please wait a minute and try again." },
  themeHeadline: { black_friday: "Black Friday: our biggest discount of the year", winter: "Warm up your print shop this winter", summer: "Summer savings for your print shop", ramadan: "Ramadan Kareem: a gift for your shop", eid: "Eid Mubarak: celebrate with a discount", national_day: "Celebrate UAE National Day with us" },
  kind: { percent: "{value}% off your subscription{dur}", amount: "AED {value} off your subscription each month{dur}", free_months: "{value} {unit} free", trial_extension: "{value} extra free trial days" },
  months: (n) => `for ${n} month${n === 1 ? "" : "s"}`,
  monthsFree: (n) => `month${n === 1 ? "" : "s"}`,
  extraDays: (n) => `${n}`,
  after: "Then the regular price.",
  claimTitle: "Offers for your shop", claimLead: "Claim a live offer on your current plan. It is applied to your next invoices.", claim: "Claim offer", claimed: "Offer claimed. It will show on your next invoice.", claimFail: "This offer is no longer available for your shop.",
};
const AR: OfferCopy = {
  endsOn: "ينتهي في {date}", endsIn: "ينتهي خلال {time}", endsToday: "ينتهي اليوم", days: "ي", hours: "س", minutes: "د", code: "الرمز", cta: "احصل على العرض", badge: "عرض محدود",
  was: "السعر المعتاد", now: "مع العرض", firstPeriod: "أول دفعة", promoLabel: "رمز ترويجي (اختياري)", promoHint: "هل لديك رمز؟ أدخله لتشاهد خصمك.",
  apply: "تطبيق", applied: "تم تطبيق العرض", autoApplied: "تم تطبيق العرض تلقائيًا", remove: "إزالة",
  failures: { invalid: "الرمز الترويجي غير صالح. تحقق من كتابته وحاول مرة أخرى.", expired: "هذا العرض لم يعد متاحًا.", sold_out: "تم استخدام هذا العرض بالكامل.", not_applicable: "هذا الرمز لا ينطبق على الباقة أو دورة الفوترة التي اخترتها.", rate: "محاولات كثيرة. انتظر دقيقة ثم حاول مرة أخرى." },
  themeHeadline: { black_friday: "الجمعة البيضاء: أكبر خصم لدينا هذا العام", winter: "دفّئ مطبعتك هذا الشتاء", summer: "وفّر في الصيف لمطبعتك", ramadan: "رمضان كريم: هدية لمطبعتك", eid: "عيد مبارك: احتفل معنا بخصم", national_day: "احتفل معنا باليوم الوطني لدولة الإمارات" },
  kind: { percent: "خصم {value}% على اشتراكك{dur}", amount: "خصم AED {value} على اشتراكك كل شهر{dur}", free_months: "{value} {unit} مجانًا", trial_extension: "{value} أيام إضافية مجانية للتجربة" },
  months: (n) => (n === 1 ? "لمدة شهر واحد" : n === 2 ? "لمدة شهرين" : n <= 10 ? `لمدة ${n} أشهر` : `لمدة ${n} شهرًا`),
  monthsFree: (n) => (n === 1 ? "شهر" : n === 2 ? "شهران" : n <= 10 ? "أشهر" : "شهرًا"),
  extraDays: (n) => `${n}`,
  after: "ثم السعر المعتاد.",
  claimTitle: "عروض لمطبعتك", claimLead: "احصل على عرض متاح على باقتك الحالية. يُطبَّق على فواتيرك القادمة.", claim: "احصل على العرض", claimed: "تم الحصول على العرض. سيظهر في فاتورتك القادمة.", claimFail: "هذا العرض لم يعد متاحًا لمطبعتك.",
};

export const OFFER_COPY = { en: EN, ar: AR } as const;
/** Typed parity check: both locales must define the same keys (compile-time). */
type Same<A, B> = [keyof A] extends [keyof B] ? ([keyof B] extends [keyof A] ? true : never) : never;
export const _offerCopyParity: Same<typeof EN, typeof AR> = true;
export const _themeParity: Same<typeof EN.themeHeadline, typeof AR.themeHeadline> = true;
export type OfferLocale = keyof typeof OFFER_COPY;

const fillS = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
export const offerCopy = (locale: OfferLocale | string): OfferCopy => OFFER_COPY[locale === "ar" ? "ar" : "en"];
export const fmtNum = (n: number, locale: string) => n.toLocaleString(locale === "ar" ? "ar-AE-u-nu-latn" : "en-AE");

/** Localised version of describeOffer(). */
export function describeOfferL(o: Pick<OfferLike, "kind" | "value" | "durationMonths">, locale: OfferLocale | string): string {
  const c = offerCopy(locale);
  const dur = o.durationMonths ? ` ${c.months(o.durationMonths)}` : "";
  const k = o.kind as keyof OfferCopy["kind"];
  const tpl = c.kind[k];
  if (!tpl) return "";
  if (o.kind === "free_months") return fillS(tpl, { value: fmtNum(Math.round(o.value), locale), unit: c.monthsFree(Math.round(o.value)) });
  if (o.kind === "trial_extension") return fillS(tpl, { value: fmtNum(Math.round(o.value), locale) });
  return fillS(tpl, { value: fmtNum(o.value, locale), dur });
}

/** Headline shown on the banner: the superadmin's own text, or the translated theme default in Arabic when the English default is unchanged. */
export function offerHeadline(o: { headline: string; name: string; theme: string }, locale: OfferLocale | string): string {
  const c = offerCopy(locale);
  const def = (c.themeHeadline as Record<string, string>)[o.theme];
  if (locale === "ar" && def) return def;
  return o.headline.trim() || def || o.name;
}
export const fillOffer = fillS;
