import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <a href="/" className="mb-8 block text-center text-2xl font-extrabold">Quick<span className="text-brand-600">Print</span></a>
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h1 className="mb-1 text-lg font-semibold">Sign in to your print shop</h1>
          <p className="mb-6 text-sm text-slate-500">Shop owners, staff and platform admins.</p>
          <LoginForm next={next} />
        </div>
        <p className="mt-4 text-center text-sm text-slate-500">New print shop? <a className="font-semibold text-brand-600" href="/signup">Start a free trial</a></p>
      </div>
    </main>
  );
}
