import { pageMetadata } from "@/lib/seo/metadata";
import { SUBPROCESSORS } from "@/lib/i18n/subprocessors";
import { SubprocessorsPage } from "@/components/platform/pages/SubprocessorsPage";

export const metadata = pageMetadata({ title: SUBPROCESSORS.en.title, description: SUBPROCESSORS.en.description, path: "/subprocessors" });
export default function Page() { return <SubprocessorsPage locale="en" />; }
