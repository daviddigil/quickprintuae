import type { Locale } from "@/lib/i18n";

/**
 * Acceptable Use Policy text (EN + AR). TEMPLATE FOR REVIEW: it must be checked by a UAE lawyer before it is relied on.
 * Kept separate from src/lib/i18n/legal.ts on purpose.
 */
export interface AupSection { h: string; p?: string[]; ul?: string[] }
export interface AupCopy { title: string; description: string; h1: string; lead: string; notice: string; sections: AupSection[]; reportCta: string; reportHref: string; back: string }

const EN: AupCopy = {
  title: "Acceptable Use Policy", description: "What may and may not be printed through QuickPrint UAE shops, and how to report content.",
  h1: "Acceptable Use Policy",
  lead: "QuickPrint UAE provides software that independent print shops use to take and produce print orders. This policy applies to every customer, every shop and every file uploaded or ordered through the platform.",
  notice: "Template for review: must be checked by a UAE lawyer before it is relied on.",
  reportCta: "Report content or request a takedown", reportHref: "/report", back: "Back",
  sections: [
    { h: "1. What you may not upload or order", p: ["You may not upload, design or order anything that:"], ul: [
      "is unlawful under the laws of the United Arab Emirates, including content that is defamatory, obscene, or that insults religion, the State or its rulers;",
      "is hateful, discriminatory, harassing, threatening or that incites violence;",
      "infringes copyright, trademarks, designs or other rights, or is a counterfeit or imitation of a branded product, logo or packaging;",
      "is a forged, altered or imitation official document, certificate, seal, currency, stamp, licence, ID or passport, or otherwise misleads people about who you are;",
      "contains personal data of other people (photos, IDs, addresses, phone numbers) that you have no right to use;",
      "depicts or promotes weapons, illegal drugs, gambling, or other regulated or prohibited goods or services;",
      "is sexually explicit, or depicts the exploitation of any person, in particular children;",
      "contains malware or is otherwise intended to harm people, systems or the platform." ] },
    { h: "2. Your right to print", p: ["When you upload a file or place an order you confirm that you own the content or have the right to print it, and that it contains nothing prohibited by this policy. The confirmation is recorded with the order. You are responsible for the content you submit and you must compensate the shop and the platform for claims caused by a breach."] },
    { h: "3. Identity documents and passports", p: ["Printing copies of IDs, passports, residence permits and similar documents is allowed only for the document holder, or for someone the holder has authorised, for a lawful purpose (for example a visa or bank application). Shops may ask for proof and may refuse. These files are marked confidential, encrypted and deleted shortly after the job is completed. Never print an identity document that is not yours without the holder's permission."] },
    { h: "4. The shop's right to refuse", p: ["Each print shop may decline or cancel any job that it believes, acting reasonably, breaches this policy or the law, or that it cannot lawfully or safely produce. The shop records a reason. A declined or cancelled paid order is refunded according to the shop's refund policy and the platform terms. The shop does not have to explain details if doing so would breach the law or put someone at risk."] },
    { h: "5. Reporting and takedown", p: ["Anyone can report content, an order or a shop using the report form. We review reports as quickly as we reasonably can. Depending on the finding we may ask the shop to stop a job, delete files, block a customer account, suspend a shop and, where the law requires, inform the authorities or the rights holder.", "If you believe your rights are infringed, include in the report who you are, what right you hold, where the content is (order number or link) and why it is unauthorised. Reports made in bad faith may lead to action against the reporter."] },
    { h: "6. Enforcement", p: ["Breaching this policy can lead to cancellation of orders, removal of files, blocking of accounts, suspension of shops, and reporting to the competent authorities. We keep records of reports and decisions as evidence, in line with the Privacy Policy."] },
    { h: "7. Changes and contact", p: ["We may update this policy; the date on the page shows the current version. Questions about this policy can be sent through the report form or to the contact details in the Terms."] },
  ],
};

const AR: AupCopy = {
  title: "سياسة الاستخدام المقبول", description: "ما يجوز وما لا يجوز طباعته عبر متاجر كويك برنت الإمارات، وكيفية الإبلاغ عن المحتوى.",
  h1: "سياسة الاستخدام المقبول",
  lead: "توفّر كويك برنت الإمارات برنامجاً تستخدمه مطابع مستقلة لاستقبال طلبات الطباعة وتنفيذها. تسري هذه السياسة على كل عميل وكل متجر وكل ملف يُرفع أو يُطلب عبر المنصة.",
  notice: "نص نموذجي للمراجعة: يجب أن يراجعه محامٍ مرخّص في دولة الإمارات قبل الاعتماد عليه.",
  reportCta: "الإبلاغ عن محتوى أو طلب إزالة", reportHref: "/ar/report", back: "رجوع",
  sections: [
    { h: "1. ما لا يجوز رفعه أو طلبه", p: ["لا يجوز لك رفع أو تصميم أو طلب أي مادة:"], ul: [
      "مخالفة لقوانين دولة الإمارات العربية المتحدة، بما في ذلك المحتوى المسيء أو القذفي أو الفاحش أو الذي يسيء إلى الأديان أو الدولة أو حكامها؛",
      "تتضمن كراهية أو تمييزاً أو مضايقة أو تهديداً أو تحريضاً على العنف؛",
      "تنتهك حقوق النشر أو العلامات التجارية أو التصاميم أو غيرها من الحقوق، أو تقلّد منتجاً أو شعاراً أو عبوة تجارية؛",
      "هي وثيقة رسمية أو شهادة أو ختم أو عملة أو طابع أو رخصة أو هوية أو جواز سفر مزوّرة أو معدّلة أو مقلّدة، أو تضلّل الآخرين بشأن هويتك؛",
      "تحتوي على بيانات شخصية لأشخاص آخرين (صور أو هويات أو عناوين أو أرقام هواتف) دون أن يكون لك حق استخدامها؛",
      "تصوّر أو تروّج للأسلحة أو المخدرات غير المشروعة أو القمار أو غيرها من السلع والخدمات المنظّمة أو المحظورة؛",
      "ذات طابع جنسي صريح، أو تصوّر استغلال أي شخص، ولا سيما الأطفال؛",
      "تحتوي على برمجيات خبيثة أو تهدف إلى الإضرار بالأشخاص أو الأنظمة أو المنصة." ] },
    { h: "2. حقك في الطباعة", p: ["عند رفع ملف أو تقديم طلب فإنك تقرّ بأنك تملك المحتوى أو لديك الحق في طباعته، وأنه لا يتضمن أي شيء تحظره هذه السياسة. يُسجَّل هذا الإقرار مع الطلب. أنت مسؤول عن المحتوى الذي تقدّمه، وتلتزم بتعويض المتجر والمنصة عن أي مطالبات تنشأ عن المخالفة."] },
    { h: "3. وثائق الهوية وجوازات السفر", p: ["لا يُسمح بطباعة نسخ من الهويات وجوازات السفر وتصاريح الإقامة وما شابهها إلا لصاحب الوثيقة أو لمن فوّضه، ولغرض مشروع (مثل طلب تأشيرة أو حساب مصرفي). يجوز للمتاجر طلب إثبات ويجوز لها الرفض. تُعلَّم هذه الملفات سرّية وتُشفَّر وتُحذف بعد وقت قصير من إتمام الطلب. لا تطبع وثيقة هوية لا تخصّك دون إذن صاحبها."] },
    { h: "4. حق المتجر في الرفض", p: ["يجوز لكل مطبعة أن ترفض أو تلغي أي طلب ترى، بشكل معقول، أنه يخالف هذه السياسة أو القانون، أو لا يمكنها تنفيذه بشكل قانوني أو آمن. وتسجّل المطبعة سبب ذلك. يُردّ مبلغ الطلب المدفوع الذي رُفض أو أُلغي وفق سياسة الاسترداد لدى المتجر وشروط المنصة. وليس على المتجر شرح التفاصيل إن كان ذلك يخالف القانون أو يعرّض أحداً للخطر."] },
    { h: "5. الإبلاغ وطلبات الإزالة", p: ["يمكن لأي شخص الإبلاغ عن محتوى أو طلب أو متجر عبر نموذج البلاغ. نراجع البلاغات بأسرع ما يمكن بشكل معقول. وبحسب النتيجة قد نطلب من المتجر إيقاف الطلب أو حذف الملفات، أو نحظر حساب عميل، أو نوقف متجراً، وعند اقتضاء القانون نُبلغ الجهات المختصة أو صاحب الحق.", "إذا كنت ترى أن حقوقك منتهكة فاذكر في البلاغ من أنت، وما الحق الذي تملكه، وأين المحتوى (رقم الطلب أو رابط)، ولماذا هو غير مصرّح به. وقد تؤدي البلاغات الكيدية إلى إجراء بحق مقدّمها."] },
    { h: "6. الإنفاذ", p: ["قد تؤدي مخالفة هذه السياسة إلى إلغاء الطلبات وإزالة الملفات وحظر الحسابات وإيقاف المتاجر وإبلاغ الجهات المختصة. نحتفظ بسجلات البلاغات والقرارات كدليل، وفق سياسة الخصوصية."] },
    { h: "7. التعديلات والتواصل", p: ["قد نحدّث هذه السياسة، ويبيّن تاريخ الصفحة النسخة الحالية. يمكن إرسال الاستفسارات عبر نموذج البلاغ أو عبر بيانات التواصل الواردة في الشروط."] },
  ],
};

export const AUP_VERSION = "2026-11-27";
export const getAupCopy = (locale: Locale): AupCopy => (locale === "ar" ? AR : EN);
