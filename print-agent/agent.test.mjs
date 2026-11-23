import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPrintCommand, parseConfig, safeName, isOffice } from "./agent.mjs";

const job = (o = {}, copies = 1) => ({ copies, options: { color: "bw", sides: "single", paperSize: "A4", ...o } });

test("linux/mac: lp args — printer, copies, sides, media, colour", () => {
  const { cmd, args } = buildPrintCommand(job({ color: "color", sides: "double", paperSize: "A3" }, 3), "linux", "/tmp/a.pdf", { printer: "HP Laser" });
  assert.equal(cmd, "lp");
  assert.deepEqual(args, ["-d", "HP Laser", "-n", "3", "-o", "sides=two-sided-long-edge", "-o", "media=A3", "-o", "print-color-mode=color", "--", "/tmp/a.pdf"]);
  const bw = buildPrintCommand(job(), "darwin", "/tmp/a.pdf");
  assert.ok(bw.args.includes("sides=one-sided") && bw.args.includes("print-color-mode=monochrome") && !bw.args.includes("-d"));
});

test("images get fit-to-page", () => {
  assert.ok(buildPrintCommand(job(), "linux", "/tmp/p.JPG").args.includes("fit-to-page"));
});

test("windows: SumatraPDF settings string", () => {
  const { cmd, args } = buildPrintCommand(job({ color: "color", sides: "double", paperSize: "Letter" }, 2), "win32", "C:\\x\\a.pdf", { printer: "Brother HL", sumatra: "C:\\S\\SumatraPDF.exe" });
  assert.equal(cmd, "C:\\S\\SumatraPDF.exe");
  assert.deepEqual(args, ["-print-to", "Brother HL", "-print-settings", "2x,duplexlong,color,paper=Letter", "-silent", "C:\\x\\a.pdf"]);
  assert.deepEqual(buildPrintCommand(job(), "win32", "a.pdf").args.slice(0, 1), ["-print-to-default"]);
  assert.throws(() => buildPrintCommand(job(), "win32", "a.docx"), /conversion/);
});

test("unknown paper falls back to A4; copies are clamped", () => {
  assert.ok(buildPrintCommand(job({ paperSize: "Tabloid-X" }), "linux", "a.pdf").args.includes("media=A4"));
  assert.equal(buildPrintCommand(job({}, 99999), "linux", "a.pdf").args[buildPrintCommand(job({}, 99999), "linux", "a.pdf").args.indexOf("-n") + 1], "999");
  assert.equal(buildPrintCommand(job({}, -4), "linux", "a.pdf").args[1], "1");
});

test("hostile filenames are passed literally as ONE argv entry (no shell)", () => {
  const evil = '/tmp/my "file"; rm -rf ~ $(whoami) `id`.pdf';
  const { args } = buildPrintCommand(job(), "linux", evil, { printer: 'P"; echo hi' });
  assert.equal(args[args.length - 1], evil);
  assert.equal(args[1], 'P"; echo hi');
  assert.equal(args.filter((a) => a === evil).length, 1);
  assert.equal(safeName("../../etc/passwd"), "passwd");
  assert.equal(safeName('a"b;c$(x).pdf'), "a_b_c_x_.pdf");
  assert.equal(safeName("..hidden"), "_hidden");
});

test("office detection and config precedence (flags > env > file)", () => {
  assert.ok(isOffice("x.DOCX") && !isOffice("x.pdf"));
  const c = parseConfig(["--server", "https://a.ae/", "--poll=5", "--once"], { QP_KEY: "qpa_env", QP_SERVER: "https://env" }, { key: "qpa_file", printer: "P" });
  assert.equal(c.server, "https://a.ae"); assert.equal(c.key, "qpa_env"); assert.equal(c.printer, "P");
  assert.equal(c.poll, 5000); assert.equal(c.once, true);
});
