/**
 * Public sub-processor list (EN + AR). TEMPLATE: "Template for review: must be checked by a UAE lawyer".
 * Locations / transfer details are placeholders marked "to be confirmed by lawyer": do not replace them with guesses.
 * Pure data: safe in client components and tests.
 */
export interface Subprocessor { name: string; purpose: string; data: string; location: string }
export interface SubprocessorsCopy {
  notice: string; title: string; description: string; h1: string; lead: string;
  cols: { name: string; purpose: string; data: string; location: string };
  footnote: string[]; nav: string;
  rows: Subprocessor[];
}

const TBC_EN = "Location and transfer mechanism: to be confirmed by lawyer.";
const TBC_AR = "الموقع وآلية النقل: يؤكدها المحامي لاحقاً.";

export const SUBPROCESSORS: { en: SubprocessorsCopy; ar: SubprocessorsCopy } = {
  en: {
    notice: "Template for review: this text must be checked by a UAE lawyer before launch",
    nav: "Sub-processors",
    title: "Sub-processors",
    description: "The companies QuickPrint UAE uses to process personal data for print shops and their customers: purpose, data categories and location of each.",
    h1: "Sub-processors",
    lead: "QuickPrint UAE acts as a processor for the personal data of a shop's customers. To run the service we use the sub-processors below. We require each of them to protect the data under a written contract.",
    cols: { name: "Sub-processor", purpose: "Purpose", data: "Data categories", location: "Location and transfer" },
    rows: [
      { name: "Stripe", purpose: "Card payments, refunds, fraud checks and billing of shops.", data: "Name, email, payment status, card brand and last four digits, order amount, gateway references.", location: `[Country / region to be confirmed.] ${TBC_EN}` },
      { name: "Anthropic", purpose: "AI design processing (for example the business card designer and the WhatsApp assistant).", data: "Text a user enters (name, title, company, contact details), logo or image content, message text.", location: `[Country / region to be confirmed.] ${TBC_EN}` },
      { name: "Resend", purpose: "Sending transactional email (order confirmations, password resets, notices).", data: "Email address, name, message content (order number, amounts, links).", location: `[Country / region to be confirmed.] ${TBC_EN}` },
      { name: "Meta (WhatsApp Cloud API)", purpose: "WhatsApp ordering and notifications for shops that enable it.", data: "Phone number, message text and media sent to or from the shop's WhatsApp number.", location: `[Country / region to be confirmed.] ${TBC_EN}` },
      { name: "Hosting and database provider", purpose: "Hosting the application and its database.", data: "All data stored in the service: accounts, orders, order contact details, logs.", location: `[Provider name and region to be confirmed.] ${TBC_EN}` },
      { name: "Object storage (S3-compatible)", purpose: "Storing files customers upload for printing; confidential files are encrypted at rest.", data: "Uploaded documents, images and artwork (may include identity documents when a customer uploads them).", location: `[Provider name and region to be confirmed.] ${TBC_EN}` },
      { name: "Cloudflare Turnstile", purpose: "Bot protection on sign-up and public forms.", data: "IP address, browser and device signals, the challenge result.", location: `[Country / region to be confirmed.] ${TBC_EN}` },
    ],
    footnote: [
      "Template for review: must be checked by a UAE lawyer. Cross-border transfer wording, the legal basis for each transfer and the exact locations are placeholders until confirmed.",
      "We will update this list when we add or replace a sub-processor and will tell shops about material changes. Questions: [support email].",
    ],
  },
  ar: {
    notice: "نموذج للمراجعة: يجب فحص هذا النص من محامٍ في الإمارات قبل الإطلاق",
    nav: "المعالجون الفرعيون",
    title: "المعالجون الفرعيون",
    description: "الشركات التي تستعين بها كويك برنت الإمارات لمعالجة البيانات الشخصية لمتاجر الطباعة وعملائها: الغرض وفئات البيانات والموقع لكل منها.",
    h1: "المعالجون الفرعيون",
    lead: "تعمل كويك برنت الإمارات بصفة معالِج للبيانات الشخصية لعملاء المتجر. ولتشغيل الخدمة نستعين بالمعالجين الفرعيين المذكورين أدناه، ونُلزم كلاً منهم بحماية البيانات بموجب عقد مكتوب.",
    cols: { name: "المعالج الفرعي", purpose: "الغرض", data: "فئات البيانات", location: "الموقع والنقل" },
    rows: [
      { name: "Stripe", purpose: "المدفوعات بالبطاقة والاستردادات وفحوص الاحتيال وفوترة المتاجر.", data: "الاسم والبريد الإلكتروني وحالة الدفع ونوع البطاقة وآخر أربعة أرقام ومبلغ الطلب ومراجع بوابة الدفع.", location: `[الدولة / المنطقة تُؤكَّد لاحقاً.] ${TBC_AR}` },
      { name: "Anthropic", purpose: "معالجة التصميم بالذكاء الاصطناعي (مثل مصمم بطاقات الأعمال ومساعد واتساب).", data: "النص الذي يدخله المستخدم (الاسم والمسمى والشركة وبيانات التواصل) ومحتوى الشعار أو الصورة ونص الرسالة.", location: `[الدولة / المنطقة تُؤكَّد لاحقاً.] ${TBC_AR}` },
      { name: "Resend", purpose: "إرسال البريد الإلكتروني الخدمي (تأكيد الطلبات وإعادة تعيين كلمة المرور والإشعارات).", data: "عنوان البريد الإلكتروني والاسم ومحتوى الرسالة (رقم الطلب والمبالغ والروابط).", location: `[الدولة / المنطقة تُؤكَّد لاحقاً.] ${TBC_AR}` },
      { name: "Meta (WhatsApp Cloud API)", purpose: "الطلب والإشعارات عبر واتساب للمتاجر التي تفعّله.", data: "رقم الهاتف ونص الرسائل والوسائط المرسلة من رقم واتساب المتجر وإليه.", location: `[الدولة / المنطقة تُؤكَّد لاحقاً.] ${TBC_AR}` },
      { name: "مزود الاستضافة وقاعدة البيانات", purpose: "استضافة التطبيق وقاعدة بياناته.", data: "كل البيانات المخزنة في الخدمة: الحسابات والطلبات وبيانات التواصل في الطلبات والسجلات.", location: `[اسم المزود والمنطقة يُؤكَّدان لاحقاً.] ${TBC_AR}` },
      { name: "تخزين الكائنات (متوافق مع S3)", purpose: "حفظ الملفات التي يرفعها العملاء للطباعة، مع تشفير الملفات السرية أثناء التخزين.", data: "المستندات والصور والتصاميم المرفوعة (وقد تشمل وثائق هوية إذا رفعها العميل).", location: `[اسم المزود والمنطقة يُؤكَّدان لاحقاً.] ${TBC_AR}` },
      { name: "Cloudflare Turnstile", purpose: "الحماية من الروبوتات عند التسجيل والنماذج العامة.", data: "عنوان IP وإشارات المتصفح والجهاز ونتيجة التحقق.", location: `[الدولة / المنطقة تُؤكَّد لاحقاً.] ${TBC_AR}` },
    ],
    footnote: [
      "نموذج للمراجعة: يجب فحصه من محامٍ في الإمارات. صياغة النقل خارج الدولة والأساس القانوني لكل نقل والمواقع الدقيقة هي نصوص مؤقتة إلى أن تُؤكَّد.",
      "سنحدّث هذه القائمة عند إضافة معالج فرعي أو استبداله، وسنبلغ المتاجر بالتغييرات الجوهرية. للاستفسار: [البريد الإلكتروني للدعم].",
    ],
  },
};
