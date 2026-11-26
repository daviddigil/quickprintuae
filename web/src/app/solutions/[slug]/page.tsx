import { notFound } from "next/navigation";
import { pageMetadata } from "@/lib/seo/metadata";
import { getCopy, isSolutionSlug, SOLUTION_SLUGS } from "@/lib/i18n";
import { primeTrialDays } from "@/server/platform-settings";
import { SolutionPage } from "@/components/platform/pages/SolutionPage";

export const dynamic = "force-dynamic"; // trial length is a live superadmin setting
export const dynamicParams = false;
export const generateStaticParams = () => SOLUTION_SLUGS.map((slug) => ({ slug }));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isSolutionSlug(slug)) return {};
  await primeTrialDays();
  return pageMetadata({ ...getCopy("en").solutions.pages[slug].meta, path: `/solutions/${slug}` });
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isSolutionSlug(slug)) notFound();
  return <SolutionPage locale="en" slug={slug} />;
}
