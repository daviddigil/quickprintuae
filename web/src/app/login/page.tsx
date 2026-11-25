import { Logo } from "@/components/platform/Logo";
import { LoginForm } from "./login-form";
import { PoweredBy } from "@/components/PoweredBy";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface-low p-4 sm:p-6">
      <div aria-hidden className="halftone halftone-fade pointer-events-none absolute inset-x-0 top-0 h-1/2 opacity-60" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="rounded-shape-xl border border-outline-variant bg-surface/85 p-6 shadow-elev-3 backdrop-blur-xl">
          <h1 className="mb-1 text-title font-semibold">Sign in to your print shop</h1>
          <p className="mb-6 text-sm text-on-surface-variant">Shop owners, staff and platform admins.</p>
          <LoginForm next={next} />
        </div>
        <p className="mt-4 text-center text-sm text-on-surface-variant">New print shop? <a className="inline-flex min-h-11 items-center font-semibold text-primary" href="/signup">Start a free trial</a></p>
        <PoweredBy className="mt-6 text-center" />
      </div>
    </main>
  );
}
