import { test } from "node:test";
import assert from "node:assert/strict";
import { sendEmail } from "./index";
import { passwordResetEmail, payoutPaidEmail, quoteReceivedEmail, verificationEmail, layout, esc } from "./templates";

test("templates: escape user input, include link, brand colours, text twin", () => {
  const r = passwordResetEmail({ name: '<img src=x onerror=1>', url: "https://app.test/reset-password/abc" });
  assert.ok(!r.html.includes("<img src=x"));
  assert.ok(r.html.includes("&lt;img") && r.html.includes("https://app.test/reset-password/abc") && r.html.includes("#1D1E3A") && r.html.includes("#FF007F"));
  assert.ok(r.text.includes("https://app.test/reset-password/abc") && r.text.includes("60 minutes"));
  assert.equal(esc(`"&'<`), "&quot;&amp;&#39;&lt;");
  assert.ok(layout({ title: "t", bodyHtml: "<p>x</p>" }).includes("Powered by Nexsofture Tech"));
});
test("verification, payout and quote templates", () => {
  for (const d of ["approved", "rejected", "needs_info"] as const) {
    const v = verificationEmail({ decision: d, businessName: "Desco LLC", reason: "Licence expired", url: "https://x.test/admin/verification" });
    assert.ok(v.subject && v.text.includes("Desco LLC") && v.html.includes("https://x.test/admin/verification"));
  }
  assert.ok(verificationEmail({ decision: "rejected", businessName: "A", reason: "blurry", url: "https://x" }).text.includes("blurry"));
  const p = payoutPaidEmail({ shopName: "Desco", amount: 1234.5, reference: "BK-1", url: "https://x" });
  assert.ok(p.subject.includes("AED 1234.50") && p.text.includes("BK-1"));
  assert.ok(quoteReceivedEmail({ shopName: "S", customerName: "Sara", summary: "200 mugs", url: "https://x" }).subject.includes("Sara"));
  assert.ok(!verificationEmail({ decision: "approved", businessName: "A", url: "javascript:alert(1)" }).html.includes('href="javascript'));
});
test("sendEmail never throws and reports errors", async () => {
  const env = { ...process.env }, real = globalThis.fetch;
  try {
    process.env.EMAIL_PROVIDER = "console"; process.env.EMAIL_TEST_OUTBOX = "1";
    const log = console.log; console.log = () => {};
    const ok = await sendEmail({ to: "a@b.ae", subject: "s", text: "t", tag: "x" }); console.log = log;
    assert.deepEqual(ok, { ok: true, provider: "console" });
    assert.equal((await sendEmail({ to: "nope", subject: "s", text: "t" })).ok, false);
    process.env.EMAIL_PROVIDER = "resend"; delete process.env.RESEND_API_KEY;
    assert.match((await sendEmail({ to: "a@b.ae", subject: "s", text: "t" })).error!, /RESEND_API_KEY/);
    process.env.RESEND_API_KEY = "re_x"; process.env.EMAIL_FROM = "QP <no-reply@quickprint.ae>";
    let body: Record<string, unknown> = {};
    globalThis.fetch = (async (url: string, init: RequestInit) => { assert.equal(url, "https://api.resend.com/emails"); assert.equal((init.headers as Record<string, string>).authorization, "Bearer re_x"); body = JSON.parse(init.body as string); return new Response("{}", { status: 200 }); }) as unknown as typeof fetch;
    assert.equal((await sendEmail({ to: "a@b.ae", subject: "S", text: "T", html: "<b>T</b>", tag: "payout.paid" })).ok, true);
    assert.deepEqual(body.to, ["a@b.ae"]); assert.equal(body.from, "QP <no-reply@quickprint.ae>");
    globalThis.fetch = (async () => new Response("bad", { status: 422 })) as unknown as typeof fetch;
    assert.match((await sendEmail({ to: "a@b.ae", subject: "S", text: "T" })).error!, /resend 422/);
    globalThis.fetch = (async () => { throw new Error("network down"); }) as unknown as typeof fetch;
    assert.deepEqual(await sendEmail({ to: "a@b.ae", subject: "S", text: "T" }), { ok: false, provider: "resend", error: "network down" });
    process.env.EMAIL_PROVIDER = "smtp";
    assert.equal((await sendEmail({ to: "a@b.ae", subject: "S", text: "T" })).ok, false);
  } finally { globalThis.fetch = real; process.env = env; }
});
