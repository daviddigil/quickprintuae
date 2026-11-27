import { pageMetadata } from "@/lib/seo/metadata";
import { ReportPage } from "@/components/platform/pages/ReportPage";

export const metadata = pageMetadata({ title: "الإبلاغ عن محتوى", description: "أبلغ عن محتوى مخالف أو طلب إزالة.", path: "/report", locale: "ar" });

export default function Page() { return <ReportPage locale="ar" />; }
