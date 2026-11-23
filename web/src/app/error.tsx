"use client";
import { useEffect } from "react";

/** Catches any render/data error in a route segment so users see a recoverable screen, not a blank crash. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 text-center" data-testid="error-boundary">
      <p className="text-5xl">⚠️</p>
      <h1 className="mt-4 text-2xl font-bold">Something went wrong</h1>
      <p className="mt-2 text-slate-600">We couldn’t load this page. This is usually temporary — please try again.</p>
      {error.digest && <p className="mt-2 text-xs text-slate-400">Reference: {error.digest}</p>}
      <div className="mt-6 flex gap-3">
        <button onClick={reset} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Try again</button>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- hard navigation resets a broken client state */}
        <a href="/" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Home</a>
      </div>
      <p className="mt-8 text-xs text-slate-400">Setting this up yourself? Open <a className="underline" href="/api/health">/api/health</a> to check the database.</p>
    </main>
  );
}
