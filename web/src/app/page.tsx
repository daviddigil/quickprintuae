import { pageMetadata } from "@/lib/seo/metadata";
import { getCopy } from "@/lib/i18n";
import { primeTrialDays } from "@/server/platform-settings";
import { HomePage } from "@/components/platform/pages/HomePage";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  await primeTrialDays();
  return pageMetadata({ ...getCopy("en").home.meta, path: "/", absoluteTitle: true });
}

export default function Home() { return <HomePage locale="en" />; }
