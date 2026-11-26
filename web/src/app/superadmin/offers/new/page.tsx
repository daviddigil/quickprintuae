import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSuperadmin } from "@/lib/auth";
import { PageTitle } from "@/components/platform/PageTitle";
import { THEME_PRESETS, toDubaiInput } from "@/lib/offer-themes";
import { OfferForm, type FormOffer } from "../offer-form";

export const metadata = { title: "New offer" };
export const dynamic = "force-dynamic";

export default async function NewOffer() {
  await requireSuperadmin();
  const plans = await db.query.plans.findMany({ orderBy: [asc(schema.plans.sortOrder)] });
  const p = THEME_PRESETS.black_friday, w = p.window(new Date());
  const initial: FormOffer = {
    name: p.name, code: "", headline: p.headline, description: "", theme: "black_friday", kind: "percent", value: 30, durationMonths: 3, planCodes: [], cycles: ["monthly", "yearly"], audience: "new",
    startsAt: toDubaiInput(w.startsAt), endsAt: toDubaiInput(w.endsAt), maxRedemptions: null, showBanner: true, status: "draft",
  };
  return (
    <>
      <PageTitle title="New offer" subtitle="Pick a theme to start from, then adjust anything." />
      <OfferForm isNew initial={initial} plans={plans.filter((x) => x.active).map((x) => ({ code: x.code, name: x.name, priceMonthly: x.priceMonthly, priceYearly: x.priceYearly, billingModel: x.billingModel }))} />
    </>
  );
}
