#!/usr/bin/env node
// QuickPrint walk-in print agent — Powered by Nexsofture Tech
// Polls the shop's print queue and sends jobs to a local printer. Zero dependencies (Node >= 20).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, copyFile, rm, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir, tmpdir, platform as osPlatform } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const OFFICE_EXT = new Set([".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".odt", ".odp", ".ods", ".rtf"]);
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp", ".heic"]);

/* ------------------------------------------------------------------ pure helpers (unit-tested) */

const CUPS_MEDIA = { A5: "A5", A4: "A4", A3: "A3", A2: "A2", Letter: "Letter", Legal: "Legal" };

/** Strip anything dangerous from a filename used on disk. */
export function safeName(name) {
  const base = path.basename(String(name ?? "document")).replace(/[^\w.\- ]+/g, "_").replace(/^\.+/, "_").trim();
  return base.slice(0, 120) || "document";
}

/**
 * Build the OS print command as { cmd, args } — arrays only, executed with execFile (never through a shell),
 * so file names containing spaces/quotes/metacharacters are passed literally.
 * job: { copies, options: { color: 'bw'|'color', sides: 'single'|'double', paperSize } }
 * opts: { printer?, sumatra? }
 */
export function buildPrintCommand(job, platform, file, opts = {}) {
  const copies = Math.min(Math.max(parseInt(job.copies, 10) || 1, 1), 999);
  const o = job.options ?? {};
  const color = o.color === "color";
  const duplex = o.sides === "double";
  const paper = CUPS_MEDIA[o.paperSize] ? o.paperSize : "A4";
  const ext = path.extname(file).toLowerCase();

  if (platform === "win32") {
    if (ext === ".pdf" || IMAGE_EXT.has(ext)) {
      const settings = [`${copies}x`, duplex ? "duplexlong" : "simplex", color ? "color" : "monochrome", `paper=${paper}`].join(",");
      const printTo = opts.printer ? ["-print-to", opts.printer] : ["-print-to-default"];
      return { cmd: opts.sumatra || "SumatraPDF.exe", args: [...printTo, "-print-settings", settings, "-silent", file] };
    }
    throw new Error(`Cannot print ${ext || "this file type"} on Windows without conversion`);
  }
  // macOS + Linux (CUPS)
  const args = [];
  if (opts.printer) args.push("-d", opts.printer);
  args.push("-n", String(copies));
  args.push("-o", `sides=${duplex ? "two-sided-long-edge" : "one-sided"}`);
  args.push("-o", `media=${CUPS_MEDIA[paper]}`);
  args.push("-o", `print-color-mode=${color ? "color" : "monochrome"}`);
  if (IMAGE_EXT.has(ext)) args.push("-o", "fit-to-page");
  args.push("--", file);
  return { cmd: "lp", args };
}

export const isOffice = (file) => OFFICE_EXT.has(path.extname(file).toLowerCase());

/** Parse CLI flags / env / ~/.quickprint-agent.json (flags win). */
export function parseConfig(argv, env, fileCfg = {}) {
  const f = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const [k, inline] = a.slice(2).split("=");
    const bool = ["once", "help"].includes(k);
    f[k] = bool ? true : inline ?? argv[++i];
  }
  return {
    server: (f.server ?? env.QP_SERVER ?? fileCfg.server ?? "").replace(/\/$/, ""),
    key: f.key ?? env.QP_KEY ?? fileCfg.key ?? "",
    printer: f.printer ?? env.QP_PRINTER ?? fileCfg.printer ?? "",
    poll: Math.max(1, Number(f.poll ?? env.QP_POLL ?? fileCfg.poll ?? 3)) * 1000,
    fake: f["fake-printer"] ?? env.QP_FAKE_PRINTER ?? fileCfg.fakePrinter ?? "",
    sumatra: f.sumatra ?? env.QP_SUMATRA ?? fileCfg.sumatra ?? "",
    once: !!f.once,
    help: !!f.help,
  };
}

/* ------------------------------------------------------------------ runtime */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let stopping = false;

class Api {
  constructor(cfg) { this.cfg = cfg; }
  async req(method, p, body) {
    const res = await fetch(`${this.cfg.server}/api/v1/agent${p}`, {
      method, headers: { authorization: `Bearer ${this.cfg.key}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60_000),
    });
    return res;
  }
  async json(method, p, body) {
    const res = await this.req(method, p, body);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error ?? `HTTP ${res.status}`); e.status = res.status; throw e; }
    return data;
  }
}

async function listPrinters() {
  try {
    if (osPlatform() === "win32") {
      const { stdout } = await run("powershell", ["-NoProfile", "-Command", "Get-Printer | Select-Object -ExpandProperty Name"]);
      return stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    }
    const { stdout } = await run("lpstat", ["-e"]);
    return stdout.split("\n").map((s) => s.trim()).filter(Boolean);
  } catch { return []; }
}

async function toPdfIfOffice(file, dir) {
  if (!isOffice(file)) return file;
  const candidates = osPlatform() === "win32"
    ? ["soffice.exe", "C:\\Program Files\\LibreOffice\\program\\soffice.exe"] : ["soffice", "libreoffice"];
  for (const c of candidates) {
    try {
      await run(c, ["--headless", "--convert-to", "pdf", "--outdir", dir, file], { timeout: 120_000 });
      const out = path.join(dir, path.basename(file, path.extname(file)) + ".pdf");
      if (existsSync(out)) return out;
    } catch { /* try next */ }
  }
  return null;
}

async function processJob(api, cfg, job) {
  const dir = await mkdtemp(path.join(tmpdir(), "qp-job-"));
  try {
    const res = await api.req("GET", `/jobs/${job.id}/file`);
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const local = path.join(dir, safeName(job.filename));
    await writeFile(local, Buffer.from(await res.arrayBuffer()));

    if (cfg.fake) {
      await mkdir(cfg.fake, { recursive: true });
      const base = `${job.ticketNo}_${job.id.slice(0, 8)}_${safeName(job.filename)}`;
      await copyFile(local, path.join(cfg.fake, base));
      await writeFile(path.join(cfg.fake, base + ".json"), JSON.stringify({ id: job.id, ticketNo: job.ticketNo, copies: job.copies, pages: job.pages, options: job.options }, null, 2));
      return { status: "printed" };
    }
    const printable = await toPdfIfOffice(local, dir);
    if (!printable) return { status: "needs_manual", error: "No converter installed (LibreOffice needed for Word/PowerPoint/Excel files)" };
    const { cmd, args } = buildPrintCommand(job, osPlatform(), printable, { printer: cfg.printer, sumatra: cfg.sumatra });
    await run(cmd, args, { timeout: 180_000 });
    return { status: "printed" };
  } finally { await rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  let fileCfg = {};
  try { fileCfg = JSON.parse(await readFile(path.join(homedir(), ".quickprint-agent.json"), "utf8")); } catch { /* optional */ }
  const cfg = parseConfig(argv, env, fileCfg);
  if (cfg.help || !cfg.server || !cfg.key) {
    console.log(`QuickPrint print agent — Powered by Nexsofture Tech

Usage: node agent.mjs --server https://yourshop.example --key qpa_xxx [--printer "HP LaserJet"] [--poll 3] [--once]
       --fake-printer DIR   save jobs to DIR instead of printing (testing)
       --sumatra PATH       SumatraPDF.exe path (Windows)
Env: QP_SERVER QP_KEY QP_PRINTER QP_POLL QP_FAKE_PRINTER QP_SUMATRA — or ~/.quickprint-agent.json`);
    return cfg.help ? 0 : 2;
  }
  const api = new Api(cfg);
  for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => { stopping = true; console.log("\nStopping after the current job…"); });

  let backoff = 1000, lastBeat = 0;
  while (!stopping) {
    try {
      if (Date.now() - lastBeat > 30_000 || cfg.once) {
        const hb = await api.json("POST", "/heartbeat", { printers: cfg.fake ? [`fake:${cfg.fake}`] : await listPrinters() });
        if (!lastBeat) console.log(`✔ Connected to ${hb.shop.name}`);
        lastBeat = Date.now();
      }
      const { job } = await api.json("POST", "/claim", { printer: cfg.printer || undefined });
      backoff = 1000;
      if (job) {
        console.log(`→ ${job.ticketNo} ${job.filename} (${job.pages}p × ${job.copies})`);
        let result;
        try { result = await processJob(api, cfg, job); }
        catch (e) { result = { status: "failed", error: String(e.message ?? e).slice(0, 400) }; }
        await api.json("POST", `/jobs/${job.id}/complete`, result);
        console.log(`  ${result.status === "printed" ? "✔ printed" : `✘ ${result.status}: ${result.error}`}`);
        continue; // immediately look for the next job
      }
      if (cfg.once) return 0;
      await sleep(cfg.poll);
    } catch (e) {
      if (e.status === 401 || e.status === 403) { console.error(`✘ ${e.message}`); return 1; }
      console.error(`! ${e.message} — retrying in ${Math.round(backoff / 1000)}s`);
      if (cfg.once) return 1;
      await sleep(backoff); backoff = Math.min(backoff * 2, 60_000);
    }
  }
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().then((code) => process.exit(code));
}
