/** DB-backed. Run via `npm test`. Guard rails, seller verification, card-on-file state machine, gating, document isolation. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/lib/env";
import { provisionTenant } from "@/server/provision";
import { GuardError, hashCardFingerprint, type VerificationInputT } from "@/lib/trust/verification";
import { isIndexableTenant } from "@/lib/seo/storefront";
import { assertSignupAllowed, computeReviewFlags, guardErrorFromDb, recordSignupIp, sharedIpTenants } from "./guards";
import { backfillTrustKeys } from "./keys";
import { removeBlocklistEntry, reviewVerification, runLicenceExpirySweep, submitVerification, VerificationError, purgeAbandonedSignups } from "./verification";
import { orderingState } from "./gating";
import { assertTenantCanTakeOrders, CheckoutError } from "@/server/checkout";
import { completeCardSetup } from "@/server/billing/gateway/setup";
import { handleStripeSetupEvent, type SetupEventDeps } from "@/server/billing/gateway/events";
import { getFile } from "@/server/storage";

const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const created: string[] = [];
const blockIds: string[] = [];
let n = 0;
const uploads = path.resolve(env.uploadDir);
after(async () => {
  for (const id of blockIds) await db.delete(schema.blocklist).where(eq(schema.blocklist.id, id));
  for (const id of created) { await db.delete(schema.tenants).where(eq(schema.tenants.id, id)); rmSync(path.join(uploads, id), { recursive: true, force: true }); }
});
let phoneSeq = Math.floor(Math.random() * 9000000) + 1000000;

async function shop(opts: { incomplete?: boolean; email?: string; phone?: string } = {}) {
  n++;
  const { tenant, owner } = await provisionTenant(db, {
    shopName: `Trust ${n} ${suffix}`, slug: `tr${suffix}${n}`.slice(0, 30), ownerName: "Owner", ownerEmail: opts.email ?? `tr${n}.${suffix}@example.ae`, ownerPassword: "pw123456pw",
    phone: opts.phone ?? `+9715${phoneSeq++}`.slice(0, 13), incomplete: opts.incomplete,
  });
  created.push(tenant.id);
  return { tenant, owner };
}
const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.from("licence ".repeat(50))]);
const input = (o: Partial<VerificationInputT> = {}): VerificationInputT => ({
  legalName: `Al Noor ${suffix} Printing LLC`, licenceNumber: `CN-${suffix}-1`, authority: "Dubai Economy & Tourism (DET)", authorityDetail: "", licenceExpiry: "2099-01-31",
  activity: "Printing services", signatoryName: "Omar Khan", trn: "", ...o,
});
async function submit(s: Awaited<ReturnType<typeof shop>>, o: Partial<VerificationInputT> = {}) {
  const tenant = (await db.query.tenants.findFirst({ where: eq(schema.tenants.id, s.tenant.id) }))!;
  return submitVerification({ tenant, ownerId: s.owner.id, ownerEmail: s.owner.email, input: input(o), file: PDF });
}
const rejects = async (p: Promise<unknown>, code: string) => { try { await p; } catch (e) { assert.ok(e instanceof GuardError, `expected GuardError ${code}, got ${(e as Error).message}`); assert.equal((e as GuardError).code, code); return; } assert.fail(`expected ${code}`); };
const reviewer = async () => (await db.query.users.findFirst({ where: eq(schema.users.role, "superadmin") }))?.id ?? "00000000-0000-0000-0000-000000000000";
const verifOf = (tenantId: string) => db.query.sellerVerifications.findFirst({ where: eq(schema.sellerVerifications.tenantId, tenantId) });
const tenantOf = (id: string) => db.query.tenants.findFirst({ where: eq(schema.tenants.id, id) }).then((t) => t!);

/* ------------------------------ owner uniqueness ------------------------------ */
test("one person, one owner account: canonical email and phone are unique platform-wide", async () => {
  const first = await shop({ email: `jo.hn${suffix}+shop@gmail.com` });
  const phone = first.owner.phone!;
  // the same mailbox in other spellings: case, dots, +tags, googlemail.com
  for (const email of [`JOHN${suffix}@GMAIL.COM`, `j.o.h.n${suffix}@googlemail.com`, `john${suffix}+two@gmail.com`])
    await rejects(assertSignupAllowed({ email, phone: "+971508887766" }), "email_taken");
  // the same phone in other spellings
  await rejects(assertSignupAllowed({ email: `fresh.${suffix}@example.ae`, phone }), "phone_taken");
  await rejects(assertSignupAllowed({ email: `fresh.${suffix}@example.ae`, phone: phone.replace("+971", "0") }), "phone_taken");
  await rejects(assertSignupAllowed({ email: `fresh.${suffix}@example.ae`, phone: phone.replace("+971", "00971") }), "phone_taken");
  await assertSignupAllowed({ email: `fresh.${suffix}@example.ae`, phone: "+971529990000" });
});

test("the database refuses a second owner with the same canonical key, and the error maps to a friendly code", async () => {
  const s = await shop();
  try {
    await shop({ email: s.owner.email.toUpperCase() });
    assert.fail("expected a unique violation");
  } catch (e) {
    const g = e instanceof GuardError ? e : guardErrorFromDb(e);
    assert.equal(g?.code, "email_taken", (e as Error).message);
  }
  try { await shop({ phone: s.owner.phone! }); assert.fail("expected a unique violation"); }
  catch (e) { assert.equal(guardErrorFromDb(e)?.code, "phone_taken", (e as Error).message); }
});

test("staff and customers do not count: only owner accounts are unique", async () => {
  const s = await shop();
  await db.insert(schema.users).values({ tenantId: s.tenant.id, role: "staff", email: `staff.${suffix}@example.ae`, name: "S", passwordHash: "x", emailCanonical: s.owner.emailCanonical, phoneCanonical: s.owner.phoneCanonical });
  assert.ok(true);
});

test("backfillTrustKeys gives old owner rows their exact canonical form, idempotently", async () => {
  const s = await shop({ email: `Old.User${suffix}+t@Gmail.com` });
  await db.update(schema.users).set({ emailCanonical: s.owner.email, phoneCanonical: null }).where(eq(schema.users.id, s.owner.id)); // as the migration left it (lower-cased only)
  const r1 = await backfillTrustKeys(db);
  assert.ok(r1.updated >= 1);
  const u = (await db.query.users.findFirst({ where: eq(schema.users.id, s.owner.id) }))!;
  assert.equal(u.emailCanonical, `olduser${suffix}@gmail.com`);
  assert.equal(u.phoneCanonical, s.owner.phoneCanonical);
  const r2 = await backfillTrustKeys(db);
  assert.equal(r2.updated, 0, "second run changes nothing");
});

/* ------------------------------ verification guard rails ------------------------------ */
test("licence number, business name and TRN: every duplicate kind is refused (never saying which shop)", async () => {
  const a = await shop(), b = await shop();
  await submit(a, { trn: `1${String(Date.now()).slice(-14)}` });
  const trn = (await verifOf(a.tenant.id))!.trn!;
  await rejects(submit(b, { licenceNumber: `cn ${suffix} 1`.toLowerCase(), legalName: `Different ${suffix} Trading` }), "licence_taken"); // case / punctuation / spaces
  await rejects(submit(b, { licenceNumber: `X-${suffix}-9`, legalName: `AL NOOR ${suffix} printing L.L.C.` }), "name_taken");           // LLC / L.L.C / case
  await rejects(submit(b, { licenceNumber: `X-${suffix}-8`, legalName: `Other ${suffix} Co`, trn }), "trn_taken");
  assert.equal(await verifOf(b.tenant.id), undefined, "nothing was saved");
  await submit(b, { licenceNumber: `X-${suffix}-7`, legalName: `Other ${suffix} Co` });
  assert.equal((await tenantOf(b.tenant.id)).verificationStatus, "pending_review");
});

test("a rejected verification frees the licence and business name; the owner can resubmit", async () => {
  const a = await shop(), b = await shop();
  await submit(a, { licenceNumber: `FREE-${suffix}`, legalName: `Free ${suffix} Prints` });
  await rejects(submit(b, { licenceNumber: `FREE-${suffix}`, legalName: `Another ${suffix} Co` }), "licence_taken");
  const v = (await verifOf(a.tenant.id))!;
  await reviewVerification({ id: v.id, action: "reject", note: "Document is not a trade licence", reviewerId: await reviewer() });
  assert.equal((await tenantOf(a.tenant.id)).verificationStatus, "rejected");
  await submit(b, { licenceNumber: `FREE-${suffix}`, legalName: `Another ${suffix} Co` }); // now allowed
  await submit(a, { licenceNumber: `FREE-${suffix}-B`, legalName: `Free ${suffix} Prints` }); // the rejected owner resubmits (own row is replaced)
  const again = (await verifOf(a.tenant.id))!;
  assert.equal(again.status, "pending_review");
  assert.ok(again.history.length >= 3, "history keeps submitted, rejected, resubmitted");
});

test("blocklist: a blocked licence, name or email refuses verification and signup", async () => {
  const s = await shop();
  const lic = `BAN-${suffix}`.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const [b1] = await db.insert(schema.blocklist).values({ kind: "licence", value: lic, reason: "fraud" }).returning(); blockIds.push(b1.id);
  await rejects(submit(s, { licenceNumber: `BAN-${suffix}` }), "blocked");
  const [b2] = await db.insert(schema.blocklist).values({ kind: "email", value: `banned.${suffix}@example.ae`, reason: "fraud" }).returning(); blockIds.push(b2.id);
  await rejects(assertSignupAllowed({ email: `Banned.${suffix}@example.ae`, phone: "+971527770000" }), "blocked");
  const [b3] = await db.insert(schema.blocklist).values({ kind: "phone", value: "+971526660000", reason: "fraud" }).returning(); blockIds.push(b3.id);
  await rejects(assertSignupAllowed({ email: `ok.${suffix}@example.ae`, phone: "052 666 0000" }), "blocked");
  // removing a block needs a written reason
  await assert.rejects(removeBlocklistEntry({ id: b1.id, reason: "short", actorId: await reviewer() }), VerificationError);
  await removeBlocklistEntry({ id: b1.id, reason: "Reviewed: mistaken identity", actorId: await reviewer() });
  const audit = await db.query.auditLogs.findFirst({ where: eq(schema.auditLogs.action, "trust.override") });
  assert.ok(audit);
});

test("review flags: similar name, disposable email and a shared network are flags, not blocks", async () => {
  const a = await shop(), b = await shop({ email: `x.${suffix}@mailinator.com` });
  await submit(a, { licenceNumber: `FL-${suffix}-1`, legalName: `Golden Star ${suffix} Printing` });
  const ip = `198.51.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  await recordSignupIp(a.tenant.id, ip); await recordSignupIp(b.tenant.id, ip);
  assert.ok((await sharedIpTenants(b.tenant.id)).includes(a.tenant.id));
  const row = (await db.query.users.findFirst({ where: eq(schema.users.id, b.owner.id) }))!;
  assert.equal(row.email.endsWith("@mailinator.com"), true);
  await submit(b, { licenceNumber: `FL-${suffix}-2`, legalName: `Golden Star ${suffix} Printings` }); // one letter off: not a duplicate
  const flags = (await verifOf(b.tenant.id))!.flags;
  assert.ok(flags.includes("disposable_email"), String(flags));
  assert.ok(flags.some((f) => f.startsWith(`similar_name:${a.tenant.id}`)), String(flags));
  assert.ok(flags.some((f) => f.startsWith("shared_ip")), String(flags));
  assert.equal((await tenantOf(b.tenant.id)).verificationStatus, "pending_review", "flags do not block");
  assert.deepEqual((await computeReviewFlags(a.tenant.id, a.owner.email, "unrelated name")).filter((f) => f.startsWith("similar")), []);
});

/* ------------------------------ review actions ------------------------------ */
test("approve needs a card on file, a future licence and (with flags) a written reason; reject needs a reason; all synced to the tenant", async () => {
  const s = await shop({ email: `fl.${suffix}@yopmail.com` });
  await submit(s, { licenceNumber: `AP-${suffix}`, legalName: `Approve ${suffix} Co` });
  const v = (await verifOf(s.tenant.id))!;
  const me = await reviewer();
  await assert.rejects(reviewVerification({ id: v.id, action: "approve", reviewerId: me }), /card on file/);
  await completeCardSetup(s.tenant.id, { paymentMethodId: `pm_${suffix}ap`, brand: "visa", last4: "4242", fingerprint: `fp-${suffix}-ap` }, { gateway: "test" });
  await assert.rejects(reviewVerification({ id: v.id, action: "approve", reviewerId: me }), /review flags/);
  await assert.rejects(reviewVerification({ id: v.id, action: "reject", note: "no", reviewerId: me }), VerificationError);
  await assert.rejects(reviewVerification({ id: v.id, action: "needs_info", reviewerId: me }), VerificationError);
  assert.equal(await reviewVerification({ id: v.id, action: "needs_info", note: "Please upload page 2 of the licence", reviewerId: me }), "needs_info");
  assert.equal((await tenantOf(s.tenant.id)).verificationStatus, "unverified");
  await submit(s, { licenceNumber: `AP-${suffix}`, legalName: `Approve ${suffix} Co` }); // owner resubmits
  assert.equal(await reviewVerification({ id: v.id, action: "approve", overrideReason: "Checked licence with DET portal by phone", reviewerId: me }), "verified");
  const t = await tenantOf(s.tenant.id);
  assert.equal(t.verificationStatus, "verified"); assert.equal(t.legalName, `Approve ${suffix} Co`);
  const after = (await verifOf(s.tenant.id))!;
  assert.ok(after.flags.includes("override") && after.history.some((h) => h.status === "override"), "override recorded in history");
  const audits = await db.query.auditLogs.findMany({ where: and(eq(schema.auditLogs.tenantId, s.tenant.id), eq(schema.auditLogs.action, "trust.override")) });
  assert.equal(audits.length, 1, "override audited once");
});

test("licence expiry: expired licences flip to 'expired' (payouts/listing stop) and a 30-day warning is sent once", async () => {
  const s = await shop();
  await submit(s, { licenceNumber: `EX-${suffix}`, legalName: `Expiry ${suffix} Co` });
  await db.update(schema.tenants).set({ cardStatus: "on_file" }).where(eq(schema.tenants.id, s.tenant.id));
  const v = (await verifOf(s.tenant.id))!;
  await reviewVerification({ id: v.id, action: "approve", reviewerId: await reviewer(), overrideReason: "Test approval of a flagged row" }).catch(() => {});
  await db.update(schema.sellerVerifications).set({ status: "verified", licenceExpiry: new Date(Date.now() + 10 * 86400_000) }).where(eq(schema.sellerVerifications.id, v.id));
  await db.update(schema.tenants).set({ verificationStatus: "verified" }).where(eq(schema.tenants.id, s.tenant.id));
  await runLicenceExpirySweep(); await runLicenceExpirySweep();
  const warned = (await verifOf(s.tenant.id))!.history.filter((h) => h.status === "expiry_warning");
  assert.equal(warned.length, 1, "warned once");
  assert.equal((await tenantOf(s.tenant.id)).verificationStatus, "verified");
  await db.update(schema.sellerVerifications).set({ licenceExpiry: new Date(Date.now() - 86400_000) }).where(eq(schema.sellerVerifications.id, v.id));
  const r = await runLicenceExpirySweep();
  assert.ok(r.expired >= 1);
  assert.equal((await tenantOf(s.tenant.id)).verificationStatus, "expired");
  assert.equal((await verifOf(s.tenant.id))!.status, "expired");
  const t = await tenantOf(s.tenant.id);
  assert.equal(isIndexableTenant({ ...t, status: "active" }), false, "expired shops are not indexed");
  assert.equal((await orderingState({ ...t, status: "active" })).open, false, "expired shops cannot take live orders");
});

/* ------------------------------ signup state machine ------------------------------ */
test("signup: incomplete -> trial only when the card is on file; trial is 14 days; repeating is idempotent", async () => {
  const s = await shop({ incomplete: true });
  let t = await tenantOf(s.tenant.id);
  assert.equal(t.status, "incomplete"); assert.equal(t.cardStatus, "pending"); assert.equal(t.trialEndsAt, null);
  assert.equal((await orderingState(t)).open, false);
  const card = { paymentMethodId: `pm_${suffix}1`, brand: "visa", last4: "4242", expMonth: 12, expYear: 2030, fingerprint: `fp-${suffix}-1` };
  const r1 = await completeCardSetup(s.tenant.id, card, { gateway: "test" });
  assert.ok(r1.ok && r1.started);
  t = await tenantOf(s.tenant.id);
  assert.equal(t.status, "trial"); assert.equal(t.cardStatus, "on_file");
  const days = (t.trialEndsAt!.getTime() - Date.now()) / 86400_000;
  assert.ok(days > 13.9 && days <= 14.01, `trial length ${days}`);
  assert.equal(t.cardFingerprintHash, hashCardFingerprint(card.fingerprint));
  assert.equal(t.billingRef.cardLast4, "4242");
  const ends = t.trialEndsAt!.getTime();
  const r2 = await completeCardSetup(s.tenant.id, card, { gateway: "test" });
  assert.ok(r2.ok && !r2.started, "second completion does not restart the trial");
  assert.equal((await tenantOf(s.tenant.id)).trialEndsAt!.getTime(), ends);
});

test("the same card cannot start a second free trial (and the review flag is recorded); a blocked card is refused", async () => {
  const a = await shop({ incomplete: true }), b = await shop({ incomplete: true });
  const card = { paymentMethodId: `pm_${suffix}2`, brand: "visa", last4: "4242", fingerprint: `fp-${suffix}-shared` };
  assert.ok((await completeCardSetup(a.tenant.id, card, { gateway: "test" })).ok);
  const r = await completeCardSetup(b.tenant.id, { ...card, paymentMethodId: `pm_${suffix}3` }, { gateway: "test" });
  assert.ok(!r.ok && r.code === "card_reused");
  const t = await tenantOf(b.tenant.id);
  assert.equal(t.status, "incomplete"); assert.equal(t.cardStatus, "failed"); assert.equal(t.trialEndsAt, null);
  assert.ok(await db.query.auditLogs.findFirst({ where: and(eq(schema.auditLogs.tenantId, b.tenant.id), eq(schema.auditLogs.action, "trust.card_reuse")) }));
  assert.ok(!/shop|store/i.test(r.message), "message does not point at another shop");
  // once the first shop is cancelled the card is free again
  await db.update(schema.tenants).set({ status: "cancelled" }).where(eq(schema.tenants.id, a.tenant.id));
  assert.ok((await completeCardSetup(b.tenant.id, { ...card, paymentMethodId: `pm_${suffix}3` }, { gateway: "test" })).ok);
  // blocklisted card
  const c = await shop({ incomplete: true });
  const [bl] = await db.insert(schema.blocklist).values({ kind: "card_hash", value: hashCardFingerprint(`fp-${suffix}-bad`), reason: "chargebacks" }).returning(); blockIds.push(bl.id);
  const rb = await completeCardSetup(c.tenant.id, { paymentMethodId: `pm_${suffix}4`, brand: "visa", last4: "0001", fingerprint: `fp-${suffix}-bad` }, { gateway: "test" });
  assert.ok(!rb.ok && rb.code === "card_blocked");
});

test("stripe setup webhook: claims only our own card-setup events, starts the trial once, idempotent by event id, failure keeps the shop incomplete", async () => {
  const s = await shop({ incomplete: true });
  const calls = { retrieve: 0, setDefault: 0 };
  const deps: SetupEventDeps = {
    async retrieveCard(pm) { calls.retrieve++; return { paymentMethodId: pm, brand: "mastercard", last4: "4444", fingerprint: `fp-${suffix}-wh` }; },
    async setDefault() { calls.setDefault++; },
    async detach() {},
  };
  const ev = (id: string, type: string, object: Record<string, unknown>) => ({ id, type, data: { object } });
  assert.equal(await handleStripeSetupEvent(ev(`evt_${suffix}_x`, "payment_intent.succeeded", { metadata: { purpose: "card_setup" } }), deps), false, "not a setup event type");
  assert.equal(await handleStripeSetupEvent(ev(`evt_${suffix}_y`, "setup_intent.succeeded", { payment_method: "pm_1", metadata: {} }), deps), false, "foreign setup intent is left to the money code");
  const good = ev(`evt_${suffix}_ok`, "setup_intent.succeeded", { id: "seti_1", payment_method: `pm_${suffix}w`, metadata: { purpose: "card_setup", tenantId: s.tenant.id } });
  assert.equal(await handleStripeSetupEvent(good, deps), true);
  assert.equal(await handleStripeSetupEvent(good, deps), true, "redelivery is acknowledged");
  assert.equal(calls.retrieve, 1, "processed once"); assert.equal(calls.setDefault, 1);
  const t = await tenantOf(s.tenant.id);
  assert.equal(t.status, "trial"); assert.equal(t.billingRef.cardBrand, "mastercard");
  // checkout.session.completed (setup mode) is claimed but does nothing extra
  assert.equal(await handleStripeSetupEvent(ev(`evt_${suffix}_cs`, "checkout.session.completed", { mode: "setup", metadata: { purpose: "card_setup", tenantId: s.tenant.id } }), deps), true);
  assert.equal(await handleStripeSetupEvent(ev(`evt_${suffix}_pay`, "checkout.session.completed", { mode: "payment", metadata: { purpose: "card_setup" } }), deps), false);
  // failure
  const f = await shop({ incomplete: true });
  assert.equal(await handleStripeSetupEvent(ev(`evt_${suffix}_f`, "setup_intent.setup_failed", { metadata: { purpose: "card_setup", tenantId: f.tenant.id }, last_setup_error: { message: "Your card was declined." } }), deps), true);
  const ft = await tenantOf(f.tenant.id);
  assert.equal(ft.status, "incomplete"); assert.equal(ft.cardStatus, "failed"); assert.equal(ft.billingRef.cardError, "Your card was declined.");
});

test("abandoned signups (no card after 7 days) are removed; shops with a trial are kept", async () => {
  const old = await shop({ incomplete: true }), kept = await shop();
  await db.update(schema.tenants).set({ createdAt: new Date(Date.now() - 9 * 86400_000) }).where(eq(schema.tenants.id, old.tenant.id));
  await db.update(schema.tenants).set({ createdAt: new Date(Date.now() - 9 * 86400_000) }).where(eq(schema.tenants.id, kept.tenant.id));
  assert.ok(await purgeAbandonedSignups() >= 1);
  assert.equal(await db.query.tenants.findFirst({ where: eq(schema.tenants.id, old.tenant.id) }), undefined);
  assert.ok(await db.query.tenants.findFirst({ where: eq(schema.tenants.id, kept.tenant.id) }));
});

/* ------------------------------ gating ------------------------------ */
test("gating: unverified and incomplete shops cannot take live orders; verified ones can; indexing follows verification", async () => {
  const s = await shop();
  const t = await tenantOf(s.tenant.id);
  await assert.rejects(assertTenantCanTakeOrders(t), (e: unknown) => e instanceof CheckoutError && /not yet open for orders/.test((e as Error).message));
  assert.equal(isIndexableTenant(t), false);
  await db.update(schema.tenants).set({ verificationStatus: "verified" }).where(eq(schema.tenants.id, s.tenant.id));
  const v = await tenantOf(s.tenant.id);
  await assertTenantCanTakeOrders(v);
  assert.equal(isIndexableTenant(v), true);
  assert.equal(isIndexableTenant({ ...v, status: "incomplete" }), false);
  assert.equal((await orderingState({ ...v, status: "incomplete" })).open, false);
  for (const vs of ["pending_review", "rejected", "expired", "unverified"]) assert.equal((await orderingState({ ...v, verificationStatus: vs })).open, false, vs);
});

/* ------------------------------ documents ------------------------------ */
test("licence documents are encrypted at rest, stored under the owner's tenant id and replaced on resubmission", async () => {
  const s = await shop();
  await submit(s, { licenceNumber: `DOC-${suffix}`, legalName: `Docs ${suffix} Co` });
  const v = (await verifOf(s.tenant.id))!;
  assert.ok(v.documentKey!.startsWith(`${s.tenant.id}/`) && v.documentKey!.endsWith(".enc"));
  const onDisk = readFileSync(path.join(uploads, v.documentKey!));
  assert.ok(!onDisk.includes(Buffer.from("%PDF-")), "ciphertext only");
  assert.deepEqual(await getFile(v.documentKey!, true), PDF);
  await assert.rejects(submit(s, { licenceNumber: `DOC-${suffix}`, legalName: `Docs ${suffix} Co` }).then(async () => {
    const tenant = (await db.query.tenants.findFirst({ where: eq(schema.tenants.id, s.tenant.id) }))!;
    await submitVerification({ tenant, ownerId: s.owner.id, ownerEmail: s.owner.email, input: input({ licenceNumber: `DOC-${suffix}`, legalName: `Docs ${suffix} Co` }), file: Buffer.from("<script>alert(1)</script>") });
  }), /PDF, JPG or PNG/);
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(path.join(dir, f)).isDirectory() ? files(path.join(dir, f)) : [path.join(dir, f)]));
  const mine = files(path.join(uploads, s.tenant.id));
  assert.equal(mine.length, 1, "old document is deleted when replaced");
});
