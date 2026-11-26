import { pageMetadata } from "@/lib/seo/metadata";
import { getCopy } from "@/lib/i18n";
import { primeTrialDays } from "@/server/platform-settings";
import { PricingPage } from "@/components/platform/pages/PricingPage";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  await primeTrialDays();
  return pageMetadata({ ...getCopy("en").pricingPage.meta, path: "/pricing" });
}

export default function Pricing() { return <PricingPage locale="en" />; }
