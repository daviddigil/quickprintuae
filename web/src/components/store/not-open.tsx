import Link from "next/link";
import { Store } from "lucide-react";

/** Shown on the cart and checkout of a store that cannot take orders yet (seller not verified). Product pages stay viewable. */
export function NotOpenNotice({ slug, title }: { slug: string; title: string }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center" data-testid="store-not-open">
      <Store aria-hidden className="mx-auto size-10 text-on-surface-variant" />
      <h1 className="mt-4 text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-lg font-medium">This store is not yet open for orders.</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-on-surface-variant">The shop is still getting set up. You can look around, and orders will open soon. Please check back later or contact the shop directly.</p>
      <Link href={`/s/${slug}`} className="mt-6 inline-flex min-h-11 items-center rounded-shape-md border border-outline px-5 text-sm font-semibold text-primary">Back to the store</Link>
    </div>
  );
}
