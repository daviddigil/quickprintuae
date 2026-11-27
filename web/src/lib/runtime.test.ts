import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeActiveInRealProduction, fakeFlag, fatalProductionProblems, ignoredFakeFlags, isRealProduction, isStrongSecret, productionWarnings } from "./runtime";
import { cronAuthorized } from "./cron-auth";

const prod = (o: Record<string, string> = {}) => ({ NODE_ENV: "production", APP_URL: "https://quickprint.ae", ...o }) as unknown as NodeJS.ProcessEnv;
const local = (o: Record<string, string> = {}) => ({ NODE_ENV: "production", APP_URL: "http://localhost:5050", ...o }) as unknown as NodeJS.ProcessEnv;
const STRONG = "x".repeat(32);

test("real production = NODE_ENV production on a non-local URL", () => {
  assert.equal(isRealProduction(prod()), true);
  assert.equal(isRealProduction(local()), false);
  assert.equal(isRealProduction({ NODE_ENV: "production", APP_URL: "http://127.0.0.1:3000" } as never), false);
  assert.equal(isRealProduction({ NODE_ENV: "development", APP_URL: "https://quickprint.ae" } as never), false);
  assert.equal(isRealProduction({ NODE_ENV: "production" } as never), false, "no APP_URL = local default");
});

test("fake switches are ignored on a real domain unless explicitly allowed", () => {
  assert.equal(fakeFlag("PAYMENTS_FAKE", prod({ PAYMENTS_FAKE: "1" })), false);
  assert.deepEqual(ignoredFakeFlags(prod({ PAYMENTS_FAKE: "1", DELIVERY_FAKE: "true" })), ["PAYMENTS_FAKE", "DELIVERY_FAKE"]);
  assert.equal(fakeFlag("PAYMENTS_FAKE", prod({ PAYMENTS_FAKE: "1", ALLOW_FAKE_IN_PRODUCTION: "1" })), true);
  assert.equal(fakeActiveInRealProduction(prod({ PAYMENTS_FAKE: "1", ALLOW_FAKE_IN_PRODUCTION: "1" })), true);
  assert.equal(fakeFlag("PAYMENTS_FAKE", local({ PAYMENTS_FAKE: "1" })), true, "local docker keeps working");
  assert.equal(fakeFlag("PAYMENTS_FAKE", prod()), false);
});

test("secrets: weak or missing values stop a real-production boot, local is unaffected", () => {
  assert.equal(isStrongSecret("dev-cron"), false); assert.equal(isStrongSecret("short"), false); assert.equal(isStrongSecret(STRONG), true);
  assert.equal(fatalProductionProblems(prod()).length, 3);
  assert.equal(fatalProductionProblems(prod({ CRON_SECRET: "dev-cron", AUTH_SECRET: STRONG, ENCRYPTION_KEY: STRONG })).length, 1);
  assert.equal(fatalProductionProblems(prod({ CRON_SECRET: STRONG, AUTH_SECRET: STRONG, ENCRYPTION_KEY: STRONG })).length, 0);
  assert.equal(fatalProductionProblems(local()).length, 0);
});

test("warnings name the risky settings", () => {
  const w = productionWarnings(prod({ SEED_DEMO: "true", SUPERADMIN_PASSWORD: "change-me-now", PAYMENTS_FAKE: "1" })).join(" ");
  assert.match(w, /ignored in production/); assert.match(w, /SUPERADMIN_PASSWORD/); assert.match(w, /SEED_DEMO/);
  assert.deepEqual(productionWarnings(local({ SEED_DEMO: "true" })), []);
});

test("cron auth: header only in real production, constant-time, no default secret", () => {
  const req = (h: Record<string, string> = {}, q = "") => new Request(`https://x.test/api/cron/purge${q}`, { headers: h });
  const prevEnv = { ...process.env };
  try {
    Object.assign(process.env, { NODE_ENV: "production", APP_URL: "https://quickprint.ae" });
    assert.equal(cronAuthorized(req({ authorization: `Bearer ${STRONG}` }), STRONG), true);
    assert.equal(cronAuthorized(req({ "x-cron-secret": STRONG }), STRONG), true);
    assert.equal(cronAuthorized(req({}, `?secret=${STRONG}`), STRONG), false, "query secret rejected in production");
    assert.equal(cronAuthorized(req({ authorization: "Bearer nope" }), STRONG), false);
    assert.equal(cronAuthorized(req(), STRONG), false);
    assert.equal(cronAuthorized(req({ authorization: "Bearer dev-cron" }), undefined), false, "no secret configured = nothing passes");
    delete process.env.CRON_SECRET;
    assert.equal(cronAuthorized(req({ authorization: "Bearer dev-cron" })), false, "the dev default does not exist in production");
    Object.assign(process.env, { NODE_ENV: "development", APP_URL: "http://localhost:3000" });
    assert.equal(cronAuthorized(req({}, "?secret=dev-cron")), true, "query form still works locally");
  } finally { for (const k of Object.keys(process.env)) if (!(k in prevEnv)) delete process.env[k]; Object.assign(process.env, prevEnv); }
});
