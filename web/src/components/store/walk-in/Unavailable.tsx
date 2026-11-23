import Link from "next/link";
import { Printer } from "lucide-react";
import { Card, LinkButton } from "@/components/ui";

export function WalkInUnavailable({ shopName, base }: { shopName: string; base: string }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center" data-testid="walk-in-unavailable">
      <Card className="p-8">
        <Printer className="mx-auto h-10 w-10 text-slate-400" />
        <h1 className="mt-4 text-xl font-bold">Walk-in printing isn&apos;t available</h1>
        <p className="mt-2 text-sm text-slate-600">{shopName} isn&apos;t taking walk-in print requests through this page right now. Please ask the staff at the counter, or order online.</p>
        <LinkButton href={base} variant="store" className="mt-6 w-full">Go to the online store</LinkButton>
      </Card>
      <Link href={base} className="sr-only">Back</Link>
    </div>
  );
}
