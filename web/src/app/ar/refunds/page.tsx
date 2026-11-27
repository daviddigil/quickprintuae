import { pageMetadata } from "@/lib/seo/metadata";
import { getLegalCopy } from "@/lib/i18n/legal";
import { primeTrialDays } from "@/server/platform-settings";
import { LegalPage } from "@/components/platform/pages/LegalPage";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { title, description } = getLegalCopy("ar", await primeTrialDays()).docs["refunds"];
  return pageMetadata({ title, description, path: "/refunds", locale: "ar" });
}

export default function RefundsPageAr() { return <LegalPage locale="ar" doc="refunds" />; }
