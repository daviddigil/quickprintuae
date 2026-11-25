import { pageMetadata } from "@/lib/seo/metadata";
import { en } from "@/lib/i18n/en";
import { SignupPage } from "@/components/platform/pages/SignupPage";

export const dynamic = "force-dynamic";
export const metadata = pageMetadata({ ...en.signup.meta, path: "/signup" });

export default async function Signup({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  return <SignupPage locale="en" plan={plan} />;
}
