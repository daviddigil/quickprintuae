/**
 * Stripe is the only payment gateway. The removed second gateway must not reappear in user-facing source (copy, pages, components,
 * routes, server text). Files that deliberately keep legacy history/handling are listed here explicitly.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "src");
const NAME = new RegExp(["ma", "mo"].join(""), "i"); // spelled in two parts so this file does not match itself

/** Legacy / history handling, relative to src/. */
const ALLOWED = new Set([
  "db/schema.ts",                    // enum value and column kept: stored rows keep their history
  "server/payments/legacy.ts",       // provider label for old rows, the idempotent retirement constants
  "server/payments/stripe-webhook.test.ts", // proves the retirement step
  "no-legacy-gateway.test.ts",
]);

function walk(dir: string, out: string[] = []) {
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out); else if (/\.(tsx?|mjs|css|json|md|txt)$/.test(n)) out.push(p);
  }
  return out;
}

test("the retired gateway's name does not appear in source outside the allowed legacy files", () => {
  const hits: string[] = [];
  for (const f of walk(ROOT)) {
    const rel = path.relative(ROOT, f).split(path.sep).join("/");
    if (ALLOWED.has(rel)) continue;
    const lines = readFileSync(f, "utf8").split("\n");
    lines.forEach((l, i) => { if (NAME.test(l)) hits.push(`${rel}:${i + 1}: ${l.trim().slice(0, 100)}`); });
  }
  assert.deepEqual(hits, [], "remove these mentions (or list a legacy-handling file in ALLOWED)");
});

test("no payment route or page for the retired gateway exists", () => {
  const dirs = walk(path.join(ROOT, "app")).filter((f) => NAME.test(f));
  assert.deepEqual(dirs, []);
});
