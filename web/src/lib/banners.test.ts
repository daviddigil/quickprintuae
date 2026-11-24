import { test } from "node:test";
import assert from "node:assert/strict";
import { bannerState, sniffImage, safeLink, dubaiLocalToDate, dateToDubaiLocal } from "./banners";

const now = new Date("2026-12-01T10:00:00Z");
test("slide state: hidden / scheduled / live / expired", () => {
  assert.equal(bannerState({ active: false, startsAt: null, endsAt: null }, now), "hidden");
  assert.equal(bannerState({ active: true, startsAt: null, endsAt: null }, now), "live");
  assert.equal(bannerState({ active: true, startsAt: new Date("2026-12-02T00:00:00Z"), endsAt: null }, now), "scheduled");
  assert.equal(bannerState({ active: true, startsAt: new Date("2026-11-01T00:00:00Z"), endsAt: new Date("2026-12-01T10:00:00Z") }, now), "expired");
  assert.equal(bannerState({ active: true, startsAt: new Date("2026-11-01T00:00:00Z"), endsAt: new Date("2026-12-31T00:00:00Z") }, now), "live");
});
test("image sniffing by magic bytes; SVG/HTML/exe rejected", () => {
  assert.equal(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0, 0]))?.mime, "image/png");
  assert.equal(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0]))?.mime, "image/jpeg");
  assert.equal(sniffImage(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))?.mime, "image/webp");
  assert.equal(sniffImage(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>")), null);
  assert.equal(sniffImage(new TextEncoder().encode("MZ\x90\x00executable....")), null);
});
test("links: only same-site paths and https", () => {
  assert.equal(safeLink("/s/demo/p/flyers"), "/s/demo/p/flyers");
  assert.equal(safeLink("https://example.com/offer"), "https://example.com/offer");
  for (const bad of ["javascript:alert(1)", "//evil.com", "http://insecure.com", "data:text/html,x", "ftp://x"]) assert.equal(safeLink(bad), null, bad);
  assert.equal(safeLink(""), null);
});
test("datetime-local is Dubai time (UTC+4)", () => {
  assert.equal(dubaiLocalToDate("2026-12-01T09:00")!.toISOString(), "2026-12-01T05:00:00.000Z");
  assert.equal(dateToDubaiLocal(new Date("2026-12-01T05:00:00Z")), "2026-12-01T09:00");
  assert.equal(dubaiLocalToDate(""), null);
});
