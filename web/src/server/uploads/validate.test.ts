import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_BYTES, MB, sanitizeFilename, validateUpload, declaredSizeError } from "./validate";

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n");

test("magic bytes must match the extension; mime is derived, not trusted", () => {
  assert.deepEqual(validateUpload("a.pdf", pdf), { ok: true, ext: ".pdf", family: "pdf", mime: "application/pdf" });
  assert.equal(validateUpload("a.png", png).ok, true);
  assert.equal(validateUpload("a.JPG", jpg).ok, true);
  assert.equal((validateUpload("a.pdf", png) as { status: number }).status, 415, "PNG renamed to .pdf");
  assert.equal((validateUpload("a.png", pdf) as { status: number }).status, 415, "PDF renamed to .png");
  assert.equal((validateUpload("a.exe", Buffer.from("MZ..")) as { status: number }).status, 415);
  assert.equal((validateUpload("a.pdf", Buffer.alloc(0)) as { status: number }).status, 400);
  assert.equal(validateUpload("a.webp", Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")])).ok, true);
  assert.equal(validateUpload("a.tiff", Buffer.from([0x49, 0x49, 0x2a, 0x00, 0])).ok, true);
  assert.equal(validateUpload("a.gif", Buffer.from("GIF89a....")).ok, true);
  assert.equal(validateUpload("a.docx", Buffer.from("PK\x03\x04....", "latin1")).ok, true);
  assert.equal(validateUpload("a.docx", Buffer.from("hello")).ok, false);
  // extension-only allowlist for design files
  assert.equal(validateUpload("logo.ai", Buffer.from("anything")).ok, true);
  const svg = validateUpload("x.svg", Buffer.from("<svg/>")); assert.ok(svg.ok && svg.mime === "application/octet-stream");
});

test("per-type size caps", () => {
  assert.equal(MAX_BYTES.image, 25 * MB); assert.equal(MAX_BYTES.pdf, 50 * MB); assert.equal(MAX_BYTES.office, 25 * MB); assert.equal(MAX_BYTES.design, 50 * MB);
  assert.equal((validateUpload("a.png", Buffer.concat([png, Buffer.alloc(26 * MB)])) as { status: number }).status, 413);
  assert.equal(declaredSizeError("a.png", 26 * MB)?.status, 413);
  assert.equal(declaredSizeError("a.pdf", 26 * MB), null);
  assert.equal(declaredSizeError("a.pdf", 51 * MB)?.status, 413);
  assert.equal(declaredSizeError("a.docx", 26 * MB)?.status, 413);
});

test("filenames are sanitised", () => {
  assert.equal(sanitizeFilename("../../etc/passwd"), "passwd");
  assert.equal(sanitizeFilename("C:\\temp\\my file.pdf"), "my file.pdf");
  assert.equal(sanitizeFilename("a\u0000b\r\n.pdf"), "ab.pdf");
  assert.equal(sanitizeFilename("\u202egnp.exe"), "gnp.exe");
  assert.equal(sanitizeFilename("..."), "file");
  assert.ok(sanitizeFilename("x".repeat(500) + ".pdf").length <= 200);
  assert.ok(sanitizeFilename("x".repeat(500) + ".pdf").endsWith(".pdf"));
});
