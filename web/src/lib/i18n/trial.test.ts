import { test } from "node:test";
import assert from "node:assert/strict";
import { getCopy } from "./index";
import { en } from "./en";
import { ar } from "./ar";
import { trialLabel, fillTrialString } from "./trial";

const walk = (v: unknown, out: string[] = []): string[] => {
  if (typeof v === "string") out.push(v); else if (Array.isArray(v)) v.forEach((x) => walk(x, out)); else if (v && typeof v === "object") Object.values(v).forEach((x) => walk(x, out));
  return out;
};

test("trialLabel: English and Arabic plurals, and the zero wording", () => {
  assert.equal(trialLabel(7, "en"), "7 days"); assert.equal(trialLabel(1, "en"), "1 day"); assert.equal(trialLabel(0, "en"), "no free trial");
  assert.equal(trialLabel(1, "ar"), "يوم واحد"); assert.equal(trialLabel(2, "ar"), "يومان"); assert.equal(trialLabel(7, "ar"), "7 أيام"); assert.equal(trialLabel(14, "ar"), "14 يومًا");
});

test("fillTrialString uses the ||0: alternative only when days = 0", () => {
  const s = "Free for {trialDays} ||0: Start now";
  assert.equal(fillTrialString(s, 5, "en"), "Free for 5 days");
  assert.equal(fillTrialString(s, 0, "en"), "Start now");
});

test("getCopy fills {trialDays} (default 7), keeps the shape, and never leaks tokens", () => {
  const g = globalThis as unknown as { __qpTrial?: { at: number; days: number } };
  const saved = g.__qpTrial;
  try {
    g.__qpTrial = undefined;
    assert.match(getCopy("en").pricingPage.lead, /7 days free/);
    assert.match(getCopy("ar").pricingPage.lead, /7 أيام مجانًا/);
    for (const days of [0, 1, 5, 7, 30]) for (const l of ["en", "ar"] as const) {
      const c = getCopy(l, days);
      assert.deepEqual(Object.keys(c), Object.keys(l === "en" ? en : ar));
      for (const s of walk(c)) assert.ok(!s.includes("{trialDays}") && !s.includes("||0:"), `token left in: ${s}`);
      assert.equal(c.home.trust.facts[3].value, days);
    }
    assert.match(getCopy("en", 1).pricingPage.lead, /1 day free/);
    assert.match(getCopy("en", 0).signup.card.noCharge, /charged today/);
    assert.equal(getCopy("en", 5), getCopy("en", 5), "memoised");
  } finally { g.__qpTrial = saved; }
});

test("no hard-coded 14-day trial text remains in the dictionaries", () => {
  for (const s of [...walk(en), ...walk(ar)]) assert.ok(!/14[- ]day|14 days|14 يومًا مجانًا|لمدة 14/.test(s.replace(/last 14 days|آخر 14 يومًا/g, "")), s);
});
