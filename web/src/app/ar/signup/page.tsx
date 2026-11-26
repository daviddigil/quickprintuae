import { pageMetadata } from "@/lib/seo/metadata";
import { getCopy } from "@/lib/i18n";
import { primeTrialDays } from "@/server/platform-settings";
import { SignupPage } from "@/components/platform/pages/SignupPage";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  await primeTrialDays();
  return pageMetadata({ ...getCopy("ar").signup.meta, path: "/signup", locale: "ar" });
}

export default async function SignupAr({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  return <SignupPage locale="ar" plan={plan} />;
}
