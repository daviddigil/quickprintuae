import { test } from "node:test";
import assert from "node:assert/strict";
import { bestOffer, describeOffer, offerApplies, offerDiscount, offerState, redemptionMonths, validateOffer, type OfferLike } from "./offers";

const now = new Date("2026-11-27T12:00:00Z");
const offer = (o: Partial<OfferLike> = {}): OfferLike => ({ id: "o1", name: "Black Friday", code: null, kind: "percent", value: 30, durationMonths: 3, planCodes: [], cycles: ["monthly", "yearly"], audience: "new", startsAt: new Date("2026-11-25T00:00:00Z"), endsAt: new Date("2026-12-01T00:00:00Z"), maxRedemptions: null, redeemedCount: 0, status: "active", ...o });
const ctx = { planCode: "growth", cycle: "monthly", isNewShop: true };

test("offer states", () => {
  assert.equal(offerState(offer(), now), "live");
  assert.equal(offerState(offer({ status: "draft" }), now), "draft");
  assert.equal(offerState(offer({ status: "paused" }), now), "paused");
  assert.equal(offerState(offer({ startsAt: new Date("2026-12-05T00:00:00Z"), endsAt: new Date("2026-12-09T00:00:00Z") }), now), "scheduled");
  assert.equal(offerState(offer({ endsAt: new Date("2026-11-26T00:00:00Z") }), now), "ended");
  assert.equal(offerState(offer({ maxRedemptions: 5, redeemedCount: 5 }), now), "sold_out");
});
test("who gets the offer: plan, cycle, audience and code", () => {
  assert.equal(offerApplies(offer(), ctx, now), true);
  assert.equal(offerApplies(offer({ planCodes: ["starter"] }), ctx, now), false);
  assert.equal(offerApplies(offer({ cycles: ["yearly"] }), ctx, now), false);
  assert.equal(offerApplies(offer(), { ...ctx, isNewShop: false }, now), false);
  assert.equal(offerApplies(offer({ audience: "all" }), { ...ctx, isNewShop: false }, now), true);
  const coded = offer({ code: "BF30" });
  assert.equal(offerApplies(coded, ctx, now), false);
  assert.equal(offerApplies(coded, { ...ctx, code: " bf30 " }, now), true);
  assert.equal(offerApplies(offer({ status: "paused" }), ctx, now), false);
});
test("discount maths never exceeds the charge", () => {
  assert.equal(offerDiscount({ kind: "percent", value: 30 }, 499), 149.7);
  assert.equal(offerDiscount({ kind: "percent", value: 150 }, 100), 100);
  assert.equal(offerDiscount({ kind: "amount", value: 100 }, 80), 80);
  assert.equal(offerDiscount({ kind: "amount", value: 100 }, 499), 100);
  assert.equal(offerDiscount({ kind: "free_months", value: 2 }, 199), 199);
  assert.equal(offerDiscount({ kind: "trial_extension", value: 14 }, 199), 0);
  assert.equal(offerDiscount({ kind: "percent", value: 30 }, 0), 0);
});
test("redemption length and best offer", () => {
  assert.equal(redemptionMonths({ kind: "free_months", value: 2, durationMonths: null }), 2);
  assert.equal(redemptionMonths({ kind: "percent", value: 20, durationMonths: 6 }), 6);
  assert.equal(redemptionMonths({ kind: "percent", value: 20, durationMonths: null }), null);
  assert.equal(redemptionMonths({ kind: "trial_extension", value: 14, durationMonths: null }), 0);
  const a = offer({ id: "a", kind: "percent", value: 20, durationMonths: 3 });
  const b = offer({ id: "b", kind: "free_months", value: 2, durationMonths: null });
  assert.equal(bestOffer([a, b], ctx, 499, now)?.id, "b");
  assert.equal(bestOffer([offer({ planCodes: ["starter"] })], ctx, 499, now), null);
});
test("descriptions and validation", () => {
  assert.equal(describeOffer({ kind: "percent", value: 30, durationMonths: 3 }), "30% off your subscription for 3 months");
  assert.equal(describeOffer({ kind: "free_months", value: 1, durationMonths: null }), "1 month free");
  assert.equal(describeOffer({ kind: "trial_extension", value: 14, durationMonths: null }), "14 extra free trial days");
  const ok = { name: "Winter Sale", kind: "percent", value: 25, durationMonths: 3, startsAt: new Date("2026-12-01"), endsAt: new Date("2026-12-31"), maxRedemptions: 100, code: "WINTER25" };
  assert.deepEqual(validateOffer(ok), []);
  assert.ok(validateOffer({ ...ok, value: 0 }).some((i) => i.field === "value"));
  assert.ok(validateOffer({ ...ok, endsAt: new Date("2026-11-01") }).some((i) => i.field === "dates"));
  assert.ok(validateOffer({ ...ok, code: "x y" }).some((i) => i.field === "code"));
  assert.ok(validateOffer({ ...ok, kind: "free_months", value: 1.5 }).some((i) => i.field === "value"));
});
