import { pageMetadata } from "@/lib/seo/metadata";
import { ar } from "@/lib/i18n/ar";
import { StoresPage, type StoresSearch } from "@/components/platform/pages/StoresPage";

export const dynamic = "force-dynamic";
export const metadata = pageMetadata({ ...ar.storesPage.meta, path: "/stores", locale: "ar" });

export default async function StoresAr({ searchParams }: { searchParams: Promise<StoresSearch> }) {
  return <StoresPage locale="ar" search={await searchParams} />;
}
