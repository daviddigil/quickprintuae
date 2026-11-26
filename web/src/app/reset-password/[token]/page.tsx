import { Logo } from "@/components/platform/Logo";
import { Alert } from "@/components/ui";
import { isResetTokenValid } from "@/server/security/password-reset";
import { ResetForm } from "./form";

export const metadata = { title: "Choose a new password", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = await isResetTokenValid(token);
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-low p-4 sm:p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="rounded-shape-xl border border-outline-variant bg-surface p-6 shadow-elev-3">
          <h1 className="mb-4 text-title font-semibold">Choose a new password</h1>
          {valid ? <ResetForm token={token} /> : (
            <div className="space-y-4">
              <Alert>This link is invalid or has expired.</Alert>
              <a className="inline-flex min-h-11 items-center font-semibold text-primary" href="/forgot-password">Request a new link</a>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
