import { Logo } from "@/components/platform/Logo";
import { ForgotForm } from "./form";

export const metadata = { title: "Forgot password", robots: { index: false, follow: false } };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ store?: string }> }) {
  const { store } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-low p-4 sm:p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="rounded-shape-xl border border-outline-variant bg-surface p-6 shadow-elev-3">
          <h1 className="mb-1 text-title font-semibold">Forgot your password?</h1>
          <p className="mb-6 text-sm text-on-surface-variant">Enter your email and we will send you a link to choose a new one.</p>
          <ForgotForm store={store && /^[a-z0-9-]{1,60}$/.test(store) ? store : undefined} />
        </div>
        <p className="mt-4 text-center text-sm"><a className="inline-flex min-h-11 items-center font-semibold text-primary" href="/login">Back to sign in</a></p>
      </div>
    </main>
  );
}
