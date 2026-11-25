import { pageMetadata } from "@/lib/seo/metadata";
import { en } from "@/lib/i18n/en";
import { HomePage } from "@/components/platform/pages/HomePage";

export const dynamic = "force-dynamic";
export const metadata = pageMetadata({ ...en.home.meta, path: "/", absoluteTitle: true });

export default function Home() { return <HomePage locale="en" />; }
