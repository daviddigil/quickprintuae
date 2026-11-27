/**
 * Default shop-level consumer terms (cancellation / returns / delivery). TEMPLATE: "Template for review: must be checked
 * by a UAE lawyer". Used on the checkout page and the order confirmation whenever the shop has not written its own text.
 * Pure module.
 */
export const RETURNS_POLICY_TEMPLATE = {
  en: [
    "Template for review: must be checked by a UAE lawyer. The shop can replace this text in Store settings.",
    "Custom-printed items (made to your files or design) are produced specifically for you. Once production has started the order generally cannot be cancelled or returned, except where the item is faulty, damaged or not what you ordered.",
    "You can cancel an order free of charge before production starts: contact the shop as soon as possible.",
    "If the item is faulty, damaged in delivery or does not match your approved order, tell the shop within 3 days of receiving it, with a photo. The shop will reprint, repair or refund.",
    "Delivery or pickup time is shown at checkout and confirmed in your order. Delays caused by courier or other events outside the shop's control are not the shop's fault, but the shop will keep you informed.",
    "Prices are in AED. The checkout shows the price including and excluding VAT.",
  ],
  ar: [
    "نموذج للمراجعة: يجب فحصه من محامٍ في الإمارات. يمكن للمتجر استبدال هذا النص من إعدادات المتجر.",
    "المنتجات المطبوعة حسب الطلب (وفق ملفاتك أو تصميمك) تُنتج خصيصاً لك. وبعد بدء الإنتاج لا يمكن عموماً إلغاء الطلب أو إرجاعه، إلا إذا كان المنتج معيباً أو تالفاً أو مخالفاً لما طلبته.",
    "يمكنك إلغاء الطلب دون رسوم قبل بدء الإنتاج: تواصل مع المتجر في أقرب وقت.",
    "إذا كان المنتج معيباً أو تضرر أثناء التوصيل أو لا يطابق طلبك المعتمد، فأبلغ المتجر خلال 3 أيام من الاستلام مع صورة. وسيعيد المتجر الطباعة أو الإصلاح أو يردّ المبلغ.",
    "يظهر موعد التسليم أو الاستلام عند الدفع ويُؤكَّد في طلبك. التأخير الناتج عن شركة التوصيل أو ظروف خارجة عن إرادة المتجر ليس مسؤوليته، لكنه سيُبقيك على اطلاع.",
    "الأسعار بالدرهم الإماراتي. يعرض الدفع السعر شاملاً ضريبة القيمة المضافة وغير شامل لها.",
  ],
} as const;

export const COMPLAINT_NOTE = {
  en: "Complaints: contact the shop at",
  ar: "للشكاوى تواصل مع المتجر على",
} as const;

export interface ResolvedPolicy { text: string[]; isTemplate: boolean }

/** Shop text when it wrote one, otherwise the template for the locale. Paragraphs are split on blank lines. */
export function resolveReturnsPolicy(custom: string | null | undefined, locale: "en" | "ar" = "en"): ResolvedPolicy {
  const t = (custom ?? "").trim();
  if (t) return { text: t.split(/\n{2,}|\r\n\r\n/).map((s) => s.trim()).filter(Boolean), isTemplate: false };
  return { text: [...RETURNS_POLICY_TEMPLATE[locale]], isTemplate: true };
}

/** Both languages for a storefront with no locale switch: custom text is shown once, the template in EN + AR. */
export function resolveReturnsPolicyBoth(custom: string | null | undefined): { en: ResolvedPolicy; ar: ResolvedPolicy | null } {
  const en = resolveReturnsPolicy(custom, "en");
  return { en, ar: en.isTemplate ? resolveReturnsPolicy(null, "ar") : null };
}
