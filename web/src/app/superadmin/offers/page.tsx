import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSuperadmin } from "@/lib/auth";
import { Alert, Badge, Button, Card, EmptyState, LinkButton, Table } from "@/components/ui";
import { PageTitle, fmtDateTime } from "@/components/platform/PageTitle";
import { formatAED } from "@/lib/pricing";
import { describeOffer, offerState } from "@/lib/offers";
import { STATE_LABEL, STATE_TONE } from "./state";
import { duplicateOffer, setOfferStatus } from "./actions";

export const metadata = { title: "Offers" };
export const dynamic = "force-dynamic";

export default async function OffersPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireSuperadmin();
  const sp = await searchParams;
  const now = new Date();
  const rows = await db.query.offers.findMany({ orderBy: [desc(schema.offers.createdAt)] });
  const given = await db.select({ offerId: schema.offerRedemptions.offerId, n: sql<number>`count(*) filter (where ${schema.offerRedemptions.status} <> 'cancelled')::int`, given: sql<number>`coalesce(sum(${schema.offerRedemptions.totalDiscount}), 0)::float` })
    .from(schema.offerRedemptions).groupBy(schema.offerRedemptions.offerId);
  const by = new Map(given.map((g) => [g.offerId, g]));
  return (
    <>
      <PageTitle title="Offers" subtitle="Seasonal discounts for shop subscriptions: Black Friday, Ramadan, Eid, National Day and your own."
        action={<LinkButton href="/superadmin/offers/new" data-testid="new-offer">New offer</LinkButton>} />
      {sp.saved && <div className="mb-4"><Alert tone="green">Saved.</Alert></div>}
      {sp.error && <div className="mb-4"><Alert>{sp.error}</Alert></div>}
      <Card>
        {rows.length === 0 ? <EmptyState title="No offers yet">Create your first offer, for example Black Friday: 30% off for 3 months.</EmptyState> : (
          <Table head={["Offer", "Discount", "Window (Dubai)", "State", "Redeemed", "Given away", ""]}>
            {rows.map((o) => {
              const st = offerState(o, now), g = by.get(o.id);
              return (
                <tr key={o.id} data-testid="offer-row" data-offer-name={o.name}>
                  <td className="px-4 py-3"><Link href={`/superadmin/offers/${o.id}`} className="font-semibold hover:underline">{o.name}</Link>
                    <div className="text-xs text-on-surface-variant">{o.code ? <>Code <code className="font-mono">{o.code}</code></> : "Automatic (no code)"} · {o.audience === "new" ? "new signups" : "all shops"}</div></td>
                  <td className="px-4 py-3 text-sm">{describeOffer(o)}</td>
                  <td className="px-4 py-3 text-xs">{fmtDateTime(o.startsAt)}<br />{fmtDateTime(o.endsAt)}</td>
                  <td className="px-4 py-3"><Badge tone={STATE_TONE[st]} dot>{STATE_LABEL[st]}</Badge></td>
                  <td className="px-4 py-3 tabular-nums"><Link href={`/superadmin/offers/${o.id}#redemptions`} className="hover:underline">{g?.n ?? 0}{o.maxRedemptions ? ` / ${o.maxRedemptions}` : ""}</Link></td>
                  <td className="px-4 py-3 tabular-nums">{formatAED(g?.given ?? 0)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {(o.status === "active" || o.status === "paused") && (
                        <form action={setOfferStatus}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="to" value={o.status === "active" ? "paused" : "active"} />
                          <Button size="sm" variant="secondary">{o.status === "active" ? "Pause" : "Resume"}</Button></form>
                      )}
                      <form action={duplicateOffer}><input type="hidden" name="id" value={o.id} /><Button size="sm" variant="ghost">Duplicate</Button></form>
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </>
  );
}
