import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSuperadmin } from "@/lib/auth";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Table } from "@/components/ui";
import { PageTitle, fmtDateTime } from "@/components/platform/PageTitle";
import { formatAED } from "@/lib/pricing";
import { offerState, type OfferKind, type OfferTheme } from "@/lib/offers";
import { toDubaiInput } from "@/lib/offer-themes";
import { OfferForm, type FormOffer } from "../offer-form";
import { STATE_LABEL, STATE_TONE } from "../state";
import { cancelOfferRedemption, deleteOffer, duplicateOffer } from "../actions";

export const metadata = { title: "Edit offer" };
export const dynamic = "force-dynamic";

export default async function EditOffer({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  await requireSuperadmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const o = await db.query.offers.findFirst({ where: eq(schema.offers.id, id) });
  if (!o) notFound();
  const sp = await searchParams;
  const [plans, reds] = await Promise.all([
    db.query.plans.findMany({ orderBy: [asc(schema.plans.sortOrder)] }),
    db.select({ r: schema.offerRedemptions, shop: schema.tenants.name, slug: schema.tenants.slug }).from(schema.offerRedemptions)
      .innerJoin(schema.tenants, eq(schema.tenants.id, schema.offerRedemptions.tenantId)).where(eq(schema.offerRedemptions.offerId, o.id)).orderBy(desc(schema.offerRedemptions.createdAt)),
  ]);
  const st = offerState(o, new Date());
  const initial: FormOffer = {
    id: o.id, name: o.name, code: o.code ?? "", headline: o.headline, description: o.description, theme: o.theme as OfferTheme, kind: o.kind as OfferKind, value: o.value, durationMonths: o.durationMonths,
    planCodes: o.planCodes, cycles: o.cycles, audience: o.audience === "all" ? "all" : "new", startsAt: toDubaiInput(o.startsAt), endsAt: toDubaiInput(o.endsAt), maxRedemptions: o.maxRedemptions, showBanner: o.showBanner,
    status: (["draft", "active", "paused"].includes(o.status) ? o.status : "draft") as FormOffer["status"], redeemedCount: o.redeemedCount,
  };
  return (
    <div className="space-y-6">
      <PageTitle title={o.name} subtitle={`${STATE_LABEL[st]} · ${o.redeemedCount} redeemed`} action={<Badge tone={STATE_TONE[st]} dot>{STATE_LABEL[st]}</Badge>} />
      <Link href="/superadmin/offers" className="text-sm text-on-surface-variant hover:underline">← All offers</Link>
      {sp.saved && <Alert tone="green">Saved.</Alert>}
      <OfferForm isNew={false} initial={initial} plans={plans.filter((x) => x.active || o.planCodes.includes(x.code)).map((x) => ({ code: x.code, name: x.name, priceMonthly: x.priceMonthly, priceYearly: x.priceYearly, billingModel: x.billingModel }))} />
      <Card id="redemptions" data-testid="redemptions">
        <CardHeader title="Redemptions" subtitle="Shops that claimed this offer. Cancelling stops future discounts and frees the slot." />
        {reds.length === 0 ? <EmptyState title="No redemptions yet" /> : (
          <Table head={["Shop", "Plan", "Redeemed", "Months left", "Discount given", "Status", ""]}>
            {reds.map(({ r, shop }) => (
              <tr key={r.id} data-testid="redemption-row">
                <td className="px-4 py-3"><Link href={`/superadmin/tenants/${r.tenantId}`} className="font-medium hover:underline">{shop}</Link></td>
                <td className="px-4 py-3 text-sm">{r.planCode ?? "—"}</td><td className="px-4 py-3 text-xs">{fmtDateTime(r.createdAt)}</td>
                <td className="px-4 py-3 tabular-nums">{r.monthsRemaining == null ? "unlimited" : r.monthsRemaining}</td><td className="px-4 py-3 tabular-nums">{formatAED(r.totalDiscount)}</td>
                <td className="px-4 py-3"><Badge tone={r.status === "active" ? "green" : "gray"}>{r.status}</Badge></td>
                <td className="px-4 py-3">{r.status !== "cancelled" && <form action={cancelOfferRedemption}><input type="hidden" name="redemptionId" value={r.id} /><input type="hidden" name="offerId" value={o.id} /><Button size="sm" variant="ghost">Cancel</Button></form>}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <div className="flex flex-wrap gap-3">
        <form action={duplicateOffer}><input type="hidden" name="id" value={o.id} /><Button variant="secondary">Duplicate offer</Button></form>
        {o.redeemedCount === 0 && reds.length === 0
          ? <form action={deleteOffer}><input type="hidden" name="id" value={o.id} /><Button variant="secondary" className="text-critical" data-testid="delete-offer">Delete offer</Button></form>
          : <p className="self-center text-sm text-on-surface-variant">This offer has redemptions, so it cannot be deleted. Pause it instead.</p>}
      </div>
    </div>
  );
}
