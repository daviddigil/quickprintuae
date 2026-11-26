import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMerchProofSvg, wrap, xmlEscape } from "./merch-proof";

test("proof sheet places artwork in the mockup area and escapes text", () => {
  const svg = buildMerchProofSvg({
    orderNumber: "AB-10001", productName: "Mug <script>", quantity: 12,
    cover: { href: "data:image/png;base64,AAAA", width: 800, height: 600 }, mockup: { enabled: true, x: 25, y: 20, w: 50, h: 40 },
    artwork: { href: "data:image/png;base64,BBBB", filename: "logo&1.png" }, text: ["Name: Sara \"S\""], details: ["Colour: White"], overlayText: "Sara",
  });
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.ok(!svg.includes("<script"));
  assert.ok(svg.includes("Mug &lt;script&gt;") && svg.includes("logo&amp;1.png") && svg.includes("Name: Sara &quot;S&quot;"));
  // photo is 600x450 at (40,110): area x = 40+25%*600 = 190, y = 110+20%*450 = 200, 300x180
  assert.match(svg, /<image href="data:image\/png;base64,BBBB" x="190\.0" y="200\.0" width="300\.0" height="135\.0" preserveAspectRatio="xMidYMid meet"\/>/);
  assert.ok(svg.includes(">Sara</text>"));
});

test("proof sheet works without photo, mockup or image artwork (PDF)", () => {
  const svg = buildMerchProofSvg({ orderNumber: "X-1", productName: "Tee", quantity: 1, artwork: { href: null, filename: "a.pdf" }, text: [], details: [] });
  assert.ok(svg.includes("PDF artwork"));
  assert.ok(svg.includes("print area"));
  const none = buildMerchProofSvg({ orderNumber: "X-1", productName: "Tee", quantity: 1, text: [], details: [] });
  assert.ok(none.includes("No artwork uploaded"));
});

test("wrap + xmlEscape helpers", () => {
  assert.deepEqual(wrap("aaa bbb ccc", 7), ["aaa bbb", "ccc"]);
  assert.deepEqual(wrap("x".repeat(10), 4), ["xxxx", "xxxx", "xx"]);
  assert.equal(xmlEscape(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
});
