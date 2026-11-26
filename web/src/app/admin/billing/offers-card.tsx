import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Tenant } from "@/db/schema";
import { Badge, Button, Card, CardHeader } from "@/components/ui";
import { describeOffer } from "@/lib/offers";
import { formatAED } from "@/lib/pricing";
import { listClaimableOffers } from "@/server/offers";
import { claimOffer } from "./offer-actions";

/** Offers this shop already has, and live offers it can still claim (existing shops: audience 'all'). Renders nothing when there is neither. */
export async function OffersCard({ tenant }: { tenant: Tenant }) {
  const [mine, claimable] = await Promise.all([
    db.query.offerRedemptions.findMany({ where: eq(schema.offerRedemptions.tenantId, tenant.id), orderBy: [desc(schema.offerRedemptions.createdAt)], limit: 5 }),
    listClaimableOffers(tenant),
  ]);
  if (!mine.length && !claimable.length) return null;
  return (
    <Card data-testid="offers-card">
      <CardHeader title="Offers" subtitle="Discounts on your subscription. They come off the subscription line before VAT." />
      <ul className="divide-y divide-outline-variant">
        {mine.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm" data-testid="my-offer">
            <span><b>{r.terms.name}</b> <span className="text-on-surface-variant">· {describeOffer(r.terms)}</span></span>
            <span className="flex items-center gap-2 text-xs text-on-surface-variant">
              {r.status === "active" && r.monthsRemaining != null && <span>{r.monthsRemaining} month{r.monthsRemaining === 1 ? "" : "s"} left</span>}
              {r.totalDiscount > 0 && <span>Saved {formatAED(r.totalDiscount)}</span>}
              <Badge tone={r.status === "active" ? "green" : "gray"}>{r.status}</Badge>
            </span>
          </li>
        ))}
        {claimable.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm" data-testid="claimable-offer">
            <span><b>{o.name}</b> <span className="text-on-surface-variant">· {describeOffer(o)}</span></span>
            <form action={claimOffer}><input type="hidden" name="offerId" value={o.id} /><Button size="sm" variant="secondary">Claim offer</Button></form>
          </li>
        ))}
      </ul>
    </Card>
  );
}
