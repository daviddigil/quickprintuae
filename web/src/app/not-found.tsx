import Link from "next/link";
import { PoweredBy } from "@/components/PoweredBy";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 text-center" data-testid="not-found">
      <p className="text-5xl font-extrabold text-outline">404</p>
      <h1 className="mt-4 text-2xl font-bold">We can’t find that page</h1>
      <p className="mt-2 text-on-surface-variant">The link may be wrong, or this shop may not be available.</p>
      <Link href="/" className="mt-6 rounded-lg bg-inverse-surface px-4 py-2 text-sm font-semibold text-white">Go home</Link>
      <PoweredBy className="mt-10" />
    </main>
  );
}
