import { test } from "node:test";
import assert from "node:assert/strict";
import { templateDesigns, paletteFor, TEMPLATES } from "./templates";
import { sanitizeDesign } from "./sanitize";
import { cardSvgString, qrPath } from "./render";
import { normaliseStatus } from "../../server/delivery/types";

const details = { name: "Fatima Al Mansoori", title: "Managing Partner", company: "Al Noor Legal Consultants", phone: "+971 50 123 4567", email: "fatima@alnoor.ae", website: "alnoor.ae", industry: "law" };

test("templates: returns requested count, distinct, inside card", () => {
  const ds = templateDesigns(details, { count: 6 });
  assert.equal(ds.length, 6);
  assert.equal(new Set(ds.map((d) => d.name)).size, 6);
  for (const d of ds) {
    for (const e of d.front.elements) if (e.type === "text") {
      assert.ok(e.x >= 0 && e.x + e.w <= d.widthMm + 0.01, `${d.name}: ${e.text} x-range`);
      assert.ok(e.y >= 0 && e.y < d.heightMm, `${d.name}: ${e.text} y`);
      assert.ok(e.fontSize >= 5);
    }
  }
  assert.ok(Object.keys(TEMPLATES).length >= 6);
});

test("templates: front-only when single-sided and adapts to size", () => {
  const ds = templateDesigns(details, { widthMm: 55, heightMm: 55, doubleSided: false });
  assert.ok(ds.every((d) => !d.back && d.widthMm === 55));
});

test("palette: industry and custom colours", () => {
  assert.equal(paletteFor(details).primary, "#0f2a4a");
  assert.equal(paletteFor({ ...details, colors: ["#123456"] }).primary, "#123456");
  assert.equal(paletteFor({ name: "x", colors: ["red"] }).primary, "#e11d48");
});

test("sanitize: clamps, drops invalid, dedupes ids, rejects bad fonts/colours/images", () => {
  const d = sanitizeDesign({
    widthMm: 85, heightMm: 55,
    front: { background: "javascript:alert(1)", elements: [
      { id: "a", type: "text", x: -10, y: 500, w: 999, text: "Hi", fontSize: 200, fontFamily: "Comic Sans", fontWeight: 650, color: "red", align: "middle" },
      { id: "a", type: "rect", x: 1, y: 1, w: 5, h: 5, fill: "#fff" },
      { id: "b", type: "image", x: 0, y: 0, w: 10, h: 10, src: "https://evil.example/x.png" },
      { id: "c", type: "script" },
      { id: "d", type: "text", text: "   " },
    ] },
  });
  assert.equal(d.front.background, "#ffffff");
  assert.equal(d.front.elements.length, 2);
  const t = d.front.elements[0];
  assert.equal(t.type, "text");
  if (t.type === "text") {
    assert.equal(t.x, 0); assert.ok(t.y <= 53); assert.ok(t.x + t.w <= 85); assert.equal(t.fontSize, 40);
    assert.equal(t.fontFamily, "Montserrat"); assert.equal(t.color, "#111827"); assert.equal(t.align, "left");
    assert.ok([600, 700].includes(t.fontWeight));
  }
  assert.notEqual(d.front.elements[0].id, d.front.elements[1].id);
  assert.equal(d.back, undefined);
});

test("svg export: valid-looking print file with bleed, escaping and QR", () => {
  const [d] = templateDesigns({ ...details, name: "A & B <Co>" });
  d.front.elements.push({ id: "q", type: "qr", x: 60, y: 30, size: 15, value: "https://alnoor.ae" });
  const svg = cardSvgString(d, "front", { cropMarks: true });
  assert.match(svg, /^<\?xml/);
  assert.match(svg, /width="99mm"/); // 85 + 2*2 bleed + 2*5 marks
  assert.match(svg, /A &amp; B &lt;Co&gt;/);
  assert.ok(qrPath("https://alnoor.ae").size >= 21);
});

test("delivery status normalisation", () => {
  const cases: [string, string][] = [
    ["Delivered", "delivered"], ["DELIVERY_FAILED", "failed"], ["undelivered", "failed"], ["out for delivery", "out_for_delivery"],
    ["in_transit", "in_transit"], ["Picked Up", "picked_up"], ["driver_assigned", "assigned"], ["cancelled", "cancelled"], ["pending", "created"],
  ];
  for (const [i, o] of cases) assert.equal(normaliseStatus(i), o, i);
});
