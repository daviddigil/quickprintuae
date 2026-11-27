import { pageMetadata } from "@/lib/seo/metadata";
import { getLegalCopy } from "@/lib/i18n/legal";
import { primeTrialDays } from "@/server/platform-settings";
import { LegalPage } from "@/components/platform/pages/LegalPage";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { title, description } = getLegalCopy("en", await primeTrialDays()).docs["privacy"];
  return pageMetadata({ title, description, path: "/privacy" });
}

export default function PrivacyPage() { return <LegalPage locale="en" doc="privacy" />; }
