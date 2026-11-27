import { pageMetadata } from "@/lib/seo/metadata";
import { SUBPROCESSORS } from "@/lib/i18n/subprocessors";
import { SubprocessorsPage } from "@/components/platform/pages/SubprocessorsPage";

export const metadata = pageMetadata({ title: SUBPROCESSORS.ar.title, description: SUBPROCESSORS.ar.description, path: "/subprocessors", locale: "ar" });
export default function Page() { return <SubprocessorsPage locale="ar" />; }
