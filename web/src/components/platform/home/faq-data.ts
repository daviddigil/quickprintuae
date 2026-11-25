import { en } from "@/lib/i18n/en";

/** Home page FAQ (English). Exported as data so structured data (FAQPage JSON-LD) can reuse the exact same answers. The Arabic list lives in src/lib/i18n/ar.ts. */
export const HOME_FAQ: { q: string; a: string }[] = en.home.faq;
