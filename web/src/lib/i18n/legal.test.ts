import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { en, ar, getLegalCopy, formatLegalDate, LEGAL_COPY } from "./legal";
import { LEGAL_KEYS, LEGAL_PATHS, LEGAL_UPDATED, LEGAL_VERSION, SIGNUP_ACCEPT_KEYS, needsReaccept } from "@/lib/legal";
import { MARKETING_PATHS } from "@/lib/seo/paths";
import { footerColumns } from "@/components/platform/nav-links";
import { SUBPROCESSORS } from "./subprocessors";

test("LEGAL_VERSION is a date string and matches the last-updated date", () => {
  assert.match(LEGAL_VERSION, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(LEGAL_UPDATED, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(formatLegalDate("2026-11-27", "en"), "27 November 2026");
  assert.equal(formatLegalDate("2026-11-27", "ar"), "27 نوفمبر 2026");
});

test("every legal page is registered (translated) and exists in en and ar under src/app", () => {
  for (const k of LEGAL_KEYS) {
    const m = MARKETING_PATHS.find((x) => x.path === LEGAL_PATHS[k]);
    assert.ok(m, `${k} missing from MARKETING_PATHS`);
    assert.equal(m!.translated, true);
    assert.ok(existsSync(join(process.cwd(), "src/app", k, "page.tsx")), `src/app/${k}`);
    assert.ok(existsSync(join(process.cwd(), "src/app/ar", k, "page.tsx")), `src/app/ar/${k}`);
  }
});

test("en and ar have identical structure for every document", () => {
  for (const k of LEGAL_KEYS) {
    const a = en.docs[k], b = ar.docs[k];
    assert.equal(b.sections.length, a.sections.length, `${k}: section count`);
    a.sections.forEach((s, i) => {
      const t = b.sections[i];
      assert.equal(t.p?.length ?? 0, s.p?.length ?? 0, `${k} s${i + 1} paragraphs`);
      assert.equal(t.ul?.length ?? 0, s.ul?.length ?? 0, `${k} s${i + 1} list`);
      assert.equal(t.after?.length ?? 0, s.after?.length ?? 0, `${k} s${i + 1} after`);
    });
    for (const d of [a, b]) assert.ok(d.description.length >= 70 && d.description.length <= 160, `${k} description ${d.description.length}`);
  }
  assert.deepEqual(Object.keys(en.nav), Object.keys(ar.nav));
});

test("placeholders are bracketed in both languages and trial length is filled", () => {
  const E = getLegalCopy("en", 7), A = getLegalCopy("ar", 7);
  for (const L of [E, A]) assert.ok(!JSON.stringify(L).includes("{trialDays}"));
  assert.match(E.docs.refunds.sections[0].p![0], /7 days/);
  assert.match(getLegalCopy("en", 14).docs.terms.sections[3].p![0], /14 days/);
  assert.match(A.docs["seller-agreement"].sections[0].p![0], /\[/);
  assert.ok(!/[\u0660-\u0669]/.test(JSON.stringify(ar)), "no Arabic-Indic digits");
  assert.match(LEGAL_COPY.en.notice, /^Template for review: this text must be checked by a UAE lawyer before launch$/);
});

test("needsReaccept: never accepted, old version, missing document", () => {
  assert.equal(needsReaccept(null), true);
  assert.equal(needsReaccept({ version: LEGAL_VERSION, documents: [...SIGNUP_ACCEPT_KEYS] }), false);
  assert.equal(needsReaccept({ version: "2020-01-01", documents: [...SIGNUP_ACCEPT_KEYS] }), true);
  assert.equal(needsReaccept({ version: LEGAL_VERSION, documents: ["terms"] }), true);
});

test("footer has a legal column with the four legal pages and sub-processors in both languages", () => {
  for (const loc of ["en", "ar"] as const) {
    const col = footerColumns(loc).find((c) => c.links.some((l) => l.href.endsWith("/terms")))!;
    const pre = loc === "ar" ? "/ar" : "";
    assert.deepEqual(col.links.slice(0, 4).map((l) => l.href), LEGAL_KEYS.map((k) => pre + LEGAL_PATHS[k]));
    assert.ok(col.links.some((l) => l.href === `${pre}/subprocessors`), "sub-processors link");
  }
});

test("sub-processors page exists in en and ar, is in the sitemap registry and lists every processor", () => {
  assert.ok(existsSync(join(process.cwd(), "src/app/subprocessors/page.tsx")));
  assert.ok(existsSync(join(process.cwd(), "src/app/ar/subprocessors/page.tsx")));
  const m = MARKETING_PATHS.find((x) => x.path === "/subprocessors");
  assert.ok(m && m.translated);
  for (const loc of ["en", "ar"] as const) {
    const c = SUBPROCESSORS[loc];
    assert.equal(c.rows.length, 7);
    for (const n of ["Stripe", "Anthropic", "Resend", "WhatsApp", "Turnstile"]) assert.ok(c.rows.some((r) => r.name.includes(n)), `${loc} ${n}`);
    assert.ok(c.rows.every((r) => /\[/.test(r.location)), `${loc}: every location is a bracketed placeholder`);
  }
  assert.match(SUBPROCESSORS.en.notice, /^Template for review/);
});

test("seller agreement has the DPA annex in both languages with matching list sizes; privacy has a transfer statement", () => {
  for (const L of [en, ar]) {
    const secs = L.docs["seller-agreement"].sections;
    const last = secs[secs.length - 1];
    assert.match(last.h, /DPA|Data Processing|معالجة البيانات/);
    assert.equal(last.ul?.length, 9);
    assert.equal(L.docs.privacy.sections[4].after?.length, 2);
  }
  assert.equal(LEGAL_VERSION, "2026-11-27");
});
