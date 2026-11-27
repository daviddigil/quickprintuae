import { pageMetadata } from "@/lib/seo/metadata";
import { getLegalCopy } from "@/lib/i18n/legal";
import { primeTrialDays } from "@/server/platform-settings";
import { LegalPage } from "@/components/platform/pages/LegalPage";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { title, description } = getLegalCopy("ar", await primeTrialDays()).docs["seller-agreement"];
  return pageMetadata({ title, description, path: "/seller-agreement", locale: "ar" });
}

export default function SellerAgreementPageAr() { return <LegalPage locale="ar" doc="seller-agreement" />; }
