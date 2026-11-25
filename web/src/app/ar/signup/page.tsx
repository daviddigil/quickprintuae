import { pageMetadata } from "@/lib/seo/metadata";
import { ar } from "@/lib/i18n/ar";
import { SignupPage } from "@/components/platform/pages/SignupPage";

export const dynamic = "force-dynamic";
export const metadata = pageMetadata({ ...ar.signup.meta, path: "/signup", locale: "ar" });

export default async function SignupAr({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  return <SignupPage locale="ar" plan={plan} />;
}
