import { getCopy } from "@/lib/i18n";

/** Home page FAQ (English), with the trial length filled. A function so it reflects the superadmin setting. */
export const homeFaq = (): { q: string; a: string }[] => getCopy("en").home.faq;
