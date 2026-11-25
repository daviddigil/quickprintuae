import { pageMetadata } from "@/lib/seo/metadata";
import { ar } from "@/lib/i18n/ar";
import { HomePage } from "@/components/platform/pages/HomePage";

export const dynamic = "force-dynamic";
export const metadata = pageMetadata({ ...ar.home.meta, path: "/", locale: "ar", absoluteTitle: true });

export default function HomeAr() { return <HomePage locale="ar" />; }
