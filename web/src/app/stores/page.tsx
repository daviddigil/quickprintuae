import { pageMetadata } from "@/lib/seo/metadata";
import { en } from "@/lib/i18n/en";
import { StoresPage, type StoresSearch } from "@/components/platform/pages/StoresPage";

export const dynamic = "force-dynamic";
export const metadata = pageMetadata({ ...en.storesPage.meta, path: "/stores" });

export default async function Stores({ searchParams }: { searchParams: Promise<StoresSearch> }) {
  return <StoresPage locale="en" search={await searchParams} />;
}
