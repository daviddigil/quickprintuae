import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Logo } from "@/components/platform/Logo";
import { StepUpPrompt } from "@/components/security/StepUpPrompt";
import { safeNext, stepUpMethod } from "@/server/security/stepup";

export const metadata = { title: "Confirm it's you", robots: { index: false } };

export default async function StepUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (!(await getCurrentUser())) redirect("/login");
  const method = await stepUpMethod();
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-low p-4 sm:p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="rounded-shape-xl border border-outline-variant bg-surface p-6 shadow-elev-3">
          <h1 className="mb-1 text-title font-semibold">Confirm it&apos;s you</h1>
          <StepUpPrompt method={method} next={safeNext(next)} />
        </div>
      </div>
    </main>
  );
}
