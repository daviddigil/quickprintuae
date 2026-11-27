import { pageMetadata } from "@/lib/seo/metadata";
import { getLegalCopy } from "@/lib/i18n/legal";
import { primeTrialDays } from "@/server/platform-settings";
import { LegalPage } from "@/components/platform/pages/LegalPage";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { title, description } = getLegalCopy("en", await primeTrialDays()).docs["terms"];
  return pageMetadata({ title, description, path: "/terms" });
}

export default function TermsPage() { return <LegalPage locale="en" doc="terms" />; }
