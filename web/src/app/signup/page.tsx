import { pageMetadata } from "@/lib/seo/metadata";
import { getCopy } from "@/lib/i18n";
import { primeTrialDays } from "@/server/platform-settings";
import { SignupPage } from "@/components/platform/pages/SignupPage";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  await primeTrialDays();
  return pageMetadata({ ...getCopy("en").signup.meta, path: "/signup" });
}

export default async function Signup({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  return <SignupPage locale="en" plan={plan} />;
}
