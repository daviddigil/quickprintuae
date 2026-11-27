import { pageMetadata } from "@/lib/seo/metadata";
import { getAupCopy } from "@/lib/i18n/aup";
import { AupPage } from "@/components/platform/pages/AupPage";

export function generateMetadata() {
  const { title, description } = getAupCopy("en");
  return pageMetadata({ title, description, path: "/acceptable-use" });
}

export default function Page() { return <AupPage locale="en" />; }
