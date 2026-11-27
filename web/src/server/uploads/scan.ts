import { connect } from "node:net";

/**
 * Malware scanning hook for uploads. Default: no-op (always ok). Set CLAMAV_HOST (and optionally CLAMAV_PORT, default 3310)
 * to scan every upload with a ClamAV clamd daemon over TCP (INSTREAM). By default a scanner outage lets the upload through
 * (logged); set CLAMAV_REQUIRED=1 to fail closed (uploads are refused while the scanner is unreachable).
 */
export type ScanResult = { ok: true } | { ok: false; reason: string };

const CHUNK = 64 * 1024;
export const SCAN_TIMEOUT_MS = 15_000;

/** clamd INSTREAM framing: "zINSTREAM\0", then [4-byte big-endian length][bytes] chunks, then a zero-length chunk. */
export function instreamFrames(buf: Buffer, chunk = CHUNK): Buffer[] {
  const out: Buffer[] = [Buffer.from("zINSTREAM\0")];
  for (let i = 0; i < buf.length; i += chunk) {
    const part = buf.subarray(i, i + chunk);
    const len = Buffer.alloc(4); len.writeUInt32BE(part.length);
    out.push(len, part);
  }
  out.push(Buffer.alloc(4));
  return out;
}

/** "stream: OK" / "stream: Eicar-Test-Signature FOUND" / "... ERROR" */
export function parseClamReply(reply: string): ScanResult {
  const r = reply.replace(/\0/g, "").trim();
  if (/\bOK$/.test(r)) return { ok: true };
  const m = /^stream:\s*(.+?)\s+FOUND$/.exec(r);
  if (m) return { ok: false, reason: `Malware detected (${m[1]})` };
  return { ok: false, reason: `Scanner error: ${r || "empty reply"}` };
}

export function clamdScan(buf: Buffer, host: string, port: number, timeoutMs = SCAN_TIMEOUT_MS): Promise<ScanResult> {
  return new Promise((resolve, reject) => {
    const sock = connect({ host, port });
    const chunks: Buffer[] = [];
    let done = false;
    const finish = (fn: () => void) => { if (!done) { done = true; clearTimeout(timer); sock.destroy(); fn(); } };
    const timer = setTimeout(() => finish(() => reject(new Error("clamd timeout"))), timeoutMs);
    sock.on("connect", () => { for (const f of instreamFrames(buf)) sock.write(f); });
    sock.on("data", (d) => chunks.push(d));
    sock.on("end", () => finish(() => resolve(parseClamReply(Buffer.concat(chunks).toString("utf8")))));
    sock.on("error", (e) => finish(() => reject(e)));
  });
}

export async function scanUpload(buf: Buffer): Promise<ScanResult> {
  const host = process.env.CLAMAV_HOST;
  if (!host) return { ok: true };
  const port = Number(process.env.CLAMAV_PORT) || 3310;
  try {
    return await clamdScan(buf, host, port);
  } catch (e) {
    if (process.env.CLAMAV_REQUIRED === "1") return { ok: false, reason: "The virus scanner is unavailable, please try again later." };
    console.error("clamav unavailable, upload allowed:", (e as Error).message);
    return { ok: true };
  }
}
