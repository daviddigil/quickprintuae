import { pageMetadata } from "@/lib/seo/metadata";
import { ar } from "@/lib/i18n/ar";
import { PricingPage } from "@/components/platform/pages/PricingPage";

export const dynamic = "force-dynamic";
export const metadata = pageMetadata({ ...ar.pricingPage.meta, path: "/pricing", locale: "ar" });

export default function PricingAr() { return <PricingPage locale="ar" />; }
