/**
 * Re-encrypts every secret stored in the database (and confidential files on local disk) from OLD_ENCRYPTION_KEY to
 * ENCRYPTION_KEY. Use it to rotate ENCRYPTION_KEY without losing gateway keys, IBANs, 2FA secrets, WhatsApp tokens, files.
 *
 *   DATABASE_URL=... OLD_ENCRYPTION_KEY=<current> ENCRYPTION_KEY=<new> npx tsx scripts/reencrypt.ts            # dry run (default)
 *   DATABASE_URL=... OLD_ENCRYPTION_KEY=<current> ENCRYPTION_KEY=<new> npx tsx scripts/reencrypt.ts --apply    # writes, in ONE transaction
 *   add --files [--upload-dir ./.uploads] to also re-encrypt confidential files (*.enc) on local disk
 *
 * It scans every text/jsonb column for values shaped like our ciphertext ("v1:iv:tag:data"), so new encrypted columns are
 * covered automatically. Values that already decrypt with the NEW key are left alone (safe to re-run). Values that decrypt
 * with neither key abort the run (nothing is written). Take a database backup first. S3 objects are not walked: for
 * STORAGE_DRIVER=s3, download the *.enc objects, run with --files against that directory, upload them back (docs/RUNBOOKS.md).
 */
import postgres from "postgres";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OLD = process.env.OLD_ENCRYPTION_KEY, NEW = process.env.ENCRYPTION_KEY, URL = process.env.DATABASE_URL;
const apply = process.argv.includes("--apply"), files = process.argv.includes("--files");
const uploadDir = path.resolve(process.argv.includes("--upload-dir") ? process.argv[process.argv.indexOf("--upload-dir") + 1] : process.env.UPLOAD_DIR || "./.uploads");
if (!OLD || !NEW || !URL) { console.error("Need DATABASE_URL, OLD_ENCRYPTION_KEY and ENCRYPTION_KEY"); process.exit(2); }
if (OLD === NEW) { console.error("OLD_ENCRYPTION_KEY and ENCRYPTION_KEY are identical"); process.exit(2); }

const keyOf = (k: string, prefix = "") => createHash("sha256").update(prefix + k).digest();
const SHAPE = /^v1:[A-Za-z0-9+/=]{16}:[A-Za-z0-9+/=]{24}:[A-Za-z0-9+/=]*$/;

function dec(payload: string, key: Buffer): string | null {
  try {
    const [, iv, tag, data] = payload.split(":");
    const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64")); d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
  } catch { return null; }
}
function enc(plain: string, key: Buffer): string {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key, iv);
  const e = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), e.toString("base64")].join(":");
}
const kOld = keyOf(OLD!), kNew = keyOf(NEW!);
const stats = { rotated: 0, already: 0, bad: [] as string[] };

/** returns the new value, or undefined if unchanged */
function convert(v: string, where: string): string | undefined {
  if (!SHAPE.test(v)) return undefined;
  const plain = dec(v, kOld);
  if (plain !== null) { stats.rotated++; return enc(plain, kNew); }
  if (dec(v, kNew) !== null) { stats.already++; return undefined; }
  stats.bad.push(where); return undefined;
}
function walk(val: unknown, where: string): { changed: boolean; value: unknown } {
  if (typeof val === "string") { const n = convert(val, where); return n === undefined ? { changed: false, value: val } : { changed: true, value: n }; }
  if (Array.isArray(val)) { let ch = false; const out = val.map((x, i) => { const r = walk(x, `${where}[${i}]`); ch ||= r.changed; return r.value; }); return { changed: ch, value: out }; }
  if (val && typeof val === "object") { let ch = false; const out: Record<string, unknown> = {}; for (const [k, x] of Object.entries(val)) { const r = walk(x, `${where}.${k}`); ch ||= r.changed; out[k] = r.value; } return { changed: ch, value: out }; }
  return { changed: false, value: val };
}

async function main() {
  const sql = postgres(URL!, { max: 1, onnotice: () => {} });
  const cols = await sql<{ table_name: string; column_name: string; data_type: string }[]>`
    select table_name, column_name, data_type from information_schema.columns
    where table_schema = 'public' and data_type in ('text','character varying','jsonb','json') order by 1,2`;
  const updates: (() => Promise<unknown>)[] = [];
  await sql.begin(async (tx) => {
    for (const c of cols) {
      const t = tx(c.table_name), col = tx(c.column_name);
      const pk = (await tx<{ attname: string }[]>`select a.attname from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = ${`public."${c.table_name}"`}::regclass and i.indisprimary`).map((r) => r.attname);
      if (pk.length !== 1) continue;
      const rows = await tx<Record<string, unknown>[]>`select ${tx(pk[0])} as pk, ${col} as v from ${t} where ${col} is not null`;
      for (const r of rows) {
        const where = `${c.table_name}.${c.column_name}#${r.pk}`;
        const res = walk(r.v, where);
        if (!res.changed) continue;
        if (apply && !stats.bad.length) await tx`update ${t} set ${col} = ${c.data_type.startsWith("json") ? tx.json(res.value as never) : (res.value as string)} where ${tx(pk[0])} = ${r.pk as string}`;
      }
    }
    if (stats.bad.length) throw new Error(`Cannot decrypt with either key (nothing written):\n  ${stats.bad.join("\n  ")}`);
    if (!apply) throw new Error("__dry_run__");
  }).catch((e: Error) => { if (e.message !== "__dry_run__") throw e; });
  void updates;
  await sql.end();
  console.log(`database: ${stats.rotated} value(s) ${apply ? "re-encrypted" : "would be re-encrypted"}, ${stats.already} already on the new key`);

  if (files) {
    const fOld = keyOf(OLD!, "files:"), fNew = keyOf(NEW!, "files:");
    let n = 0, skipped = 0;
    const walkDir = async (dir: string): Promise<void> => {
      for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { await walkDir(p); continue; }
        if (!e.name.endsWith(".enc")) continue;
        const buf = await readFile(p);
        try {
          const d = createDecipheriv("aes-256-gcm", fOld, buf.subarray(0, 12)); d.setAuthTag(buf.subarray(12, 28));
          const plain = Buffer.concat([d.update(buf.subarray(28)), d.final()]);
          const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", fNew, iv);
          const e2 = Buffer.concat([c.update(plain), c.final()]);
          if (apply) await writeFile(p, Buffer.concat([iv, c.getAuthTag(), e2]));
          n++;
        } catch { skipped++; }
      }
    };
    await walkDir(uploadDir);
    console.log(`files: ${n} ${apply ? "re-encrypted" : "would be re-encrypted"}, ${skipped} skipped (already new key or unreadable)`);
  }
  console.log(apply ? "DONE. Now deploy with ENCRYPTION_KEY=<new> and remove OLD_ENCRYPTION_KEY." : "Dry run only. Re-run with --apply to write.");
}
main().catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
