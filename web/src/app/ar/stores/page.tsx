import { pageMetadata } from "@/lib/seo/metadata";
import { getCopy } from "@/lib/i18n";
import { primeTrialDays } from "@/server/platform-settings";
import { StoresPage, type StoresSearch } from "@/components/platform/pages/StoresPage";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  await primeTrialDays();
  return pageMetadata({ ...getCopy("ar").storesPage.meta, path: "/stores", locale: "ar" });
}

export default async function StoresAr({ searchParams }: { searchParams: Promise<StoresSearch> }) {
  return <StoresPage locale="ar" search={await searchParams} />;
}
