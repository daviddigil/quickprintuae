import { test } from "node:test";
import assert from "node:assert/strict";
import { publicOrigin } from "./origin";

const req = (url: string, headers: Record<string, string>) => new Request(url, { headers });

test("uses the browser's host, not the container's internal address", () => {
  assert.equal(publicOrigin(req("http://0.0.0.0:3000/logout", { host: "localhost:5050" })), "http://localhost:5050");
});
test("honours reverse-proxy headers", () => {
  assert.equal(publicOrigin(req("http://0.0.0.0:3000/x", { host: "internal:3000", "x-forwarded-host": "shop.example.ae", "x-forwarded-proto": "https" })), "https://shop.example.ae");
});
test("never returns a wildcard bind address", () => {
  process.env.APP_URL = "http://localhost:5050";
  assert.equal(publicOrigin(req("http://0.0.0.0:3000/x", { host: "0.0.0.0:3000" })), "http://localhost:5050");
});
