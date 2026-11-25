import { pageMetadata } from "@/lib/seo/metadata";
import { en } from "@/lib/i18n/en";
import { PricingPage } from "@/components/platform/pages/PricingPage";

export const dynamic = "force-dynamic";
export const metadata = pageMetadata({ ...en.pricingPage.meta, path: "/pricing" });

export default function Pricing() { return <PricingPage locale="en" />; }
