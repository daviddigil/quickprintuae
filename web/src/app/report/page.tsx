import { pageMetadata } from "@/lib/seo/metadata";
import { ReportPage } from "@/components/platform/pages/ReportPage";

export const metadata = pageMetadata({ title: "Report content", description: "Report unlawful or infringing content, or request a takedown.", path: "/report" });

export default function Page() { return <ReportPage locale="en" />; }
