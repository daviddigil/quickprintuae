import { Logo } from "@/components/platform/Logo";
import { LoginForm } from "./login-form";
import { PoweredBy } from "@/components/PoweredBy";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h1 className="mb-1 text-lg font-semibold">Sign in to your print shop</h1>
          <p className="mb-6 text-sm text-on-surface-variant">Shop owners, staff and platform admins.</p>
          <LoginForm next={next} />
        </div>
        <p className="mt-4 text-center text-sm text-on-surface-variant">New print shop? <a className="font-semibold text-primary" href="/signup">Start a free trial</a></p>
        <PoweredBy className="mt-6 text-center" />
      </div>
    </main>
  );
}
