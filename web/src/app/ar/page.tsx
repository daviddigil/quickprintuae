import { pageMetadata } from "@/lib/seo/metadata";
import { getCopy } from "@/lib/i18n";
import { primeTrialDays } from "@/server/platform-settings";
import { HomePage } from "@/components/platform/pages/HomePage";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  await primeTrialDays();
  return pageMetadata({ ...getCopy("ar").home.meta, path: "/", locale: "ar", absoluteTitle: true });
}

export default function HomeAr() { return <HomePage locale="ar" />; }
