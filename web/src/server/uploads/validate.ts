import path from "node:path";

/**
 * Upload validation, pure (no I/O). Rules:
 *  - the extension picks a type family, and for families we can verify the file's magic bytes MUST match (PDF, PNG, JPEG, WebP, TIFF, GIF);
 *  - office (doc/docx/ppt/pptx/xls/xlsx) and design files (ai/eps/indd/psd/svg/heic) are accepted BY EXTENSION ONLY: they are containers
 *    (zip/OLE/PostScript/proprietary) that we do not parse, so only a lightweight signature sanity check applies where one is cheap and
 *    reliable (OOXML and legacy Office are checked, the rest are an allowlist by extension plus size). Never open them on the server;
 *  - file.type from the browser is never trusted: the stored mime comes from the verified/derived type.
 */
export type Family = "pdf" | "image" | "office" | "design";

export const MB = 1024 * 1024;
export const MAX_BYTES: Record<Family, number> = { image: 25 * MB, pdf: 50 * MB, office: 25 * MB, design: 50 * MB };
/** Largest value of the above: used for a cheap pre-check before the body is read. */
export const ABSOLUTE_MAX_BYTES = 50 * MB;
export const PDF_MAX_PAGES = 2000;

interface TypeInfo { family: Family; mime: string; /** magic byte check; undefined = extension-only allowlist */ magic?: (b: Buffer) => boolean }
const startsWith = (b: Buffer, s: string | number[], at = 0) => {
  const sig = typeof s === "string" ? Buffer.from(s, "latin1") : Buffer.from(s);
  return b.length >= at + sig.length && b.subarray(at, at + sig.length).equals(sig);
};
const isJpeg = (b: Buffer) => startsWith(b, [0xff, 0xd8, 0xff]);
const isPng = (b: Buffer) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const isWebp = (b: Buffer) => startsWith(b, "RIFF") && startsWith(b, "WEBP", 8);
const isTiff = (b: Buffer) => startsWith(b, [0x49, 0x49, 0x2a, 0x00]) || startsWith(b, [0x4d, 0x4d, 0x00, 0x2a]) || startsWith(b, [0x49, 0x49, 0x2b, 0x00]) || startsWith(b, [0x4d, 0x4d, 0x00, 0x2b]);
const isGif = (b: Buffer) => startsWith(b, "GIF87a") || startsWith(b, "GIF89a");
/** %PDF- may be preceded by a little junk in real files; the spec allows it within the first 1024 bytes. */
const isPdf = (b: Buffer) => b.subarray(0, 1024).includes("%PDF-");
const isZip = (b: Buffer) => startsWith(b, "PK\x03\x04") || startsWith(b, "PK\x05\x06");
const isOle = (b: Buffer) => startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

const OOXML = (mime: string): TypeInfo => ({ family: "office", mime, magic: isZip });
const OLE = (mime: string): TypeInfo => ({ family: "office", mime, magic: isOle });

export const TYPES: Record<string, TypeInfo> = {
  ".pdf": { family: "pdf", mime: "application/pdf", magic: isPdf },
  ".png": { family: "image", mime: "image/png", magic: isPng },
  ".jpg": { family: "image", mime: "image/jpeg", magic: isJpeg },
  ".jpeg": { family: "image", mime: "image/jpeg", magic: isJpeg },
  ".webp": { family: "image", mime: "image/webp", magic: isWebp },
  ".tif": { family: "image", mime: "image/tiff", magic: isTiff },
  ".tiff": { family: "image", mime: "image/tiff", magic: isTiff },
  ".gif": { family: "image", mime: "image/gif", magic: isGif },
  // extension-only allowlist (HEIC and SVG have no cheap reliable signature; SVG is served as a download, never inline)
  ".heic": { family: "image", mime: "image/heic" },
  ".svg": { family: "image", mime: "application/octet-stream" },
  ".docx": OOXML("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
  ".pptx": OOXML("application/vnd.openxmlformats-officedocument.presentationml.presentation"),
  ".xlsx": OOXML("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
  ".doc": OLE("application/msword"),
  ".ppt": OLE("application/vnd.ms-powerpoint"),
  ".xls": OLE("application/vnd.ms-excel"),
  ".ai": { family: "design", mime: "application/octet-stream" },
  ".eps": { family: "design", mime: "application/postscript" },
  ".indd": { family: "design", mime: "application/octet-stream" },
  ".psd": { family: "design", mime: "image/vnd.adobe.photoshop", magic: (b) => startsWith(b, "8BPS") },
};

export const ALLOWED_EXTENSIONS = new Set(Object.keys(TYPES));

/** Strips directories, control characters and path separators; keeps a readable, bounded name. Never empty. */
export function sanitizeFilename(name: string, max = 200): string {
  const base = name.replace(/[\\/]+/g, "/").split("/").pop()!.replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g, "").replace(/^\.+/, "").replace(/\s+/g, " ").trim();
  const ext = path.extname(base);
  const stem = base.slice(0, base.length - ext.length);
  const out = (stem.slice(0, Math.max(1, max - ext.length)) + ext).trim();
  return out || "file";
}

export type Validation =
  | { ok: true; ext: string; family: Family; mime: string }
  | { ok: false; status: 413 | 415 | 400; error: string };

/** Size is checked against the per-family cap, then the magic bytes against the extension. */
export function validateUpload(filename: string, buf: Buffer): Validation {
  const ext = path.extname(filename).toLowerCase();
  const info = TYPES[ext];
  if (!info) return { ok: false, status: 415, error: `File type ${ext || "unknown"} is not supported. Use PDF, Word, PowerPoint, Excel, JPG, PNG, WebP, TIFF or a design file (AI, EPS, INDD, PSD).` };
  if (buf.length === 0) return { ok: false, status: 400, error: "File is empty" };
  const max = MAX_BYTES[info.family];
  if (buf.length > max) return { ok: false, status: 413, error: `${info.family === "pdf" ? "PDF" : info.family === "image" ? "Image" : info.family === "office" ? "Document" : "Design"} files can be at most ${max / MB} MB` };
  if (info.magic && !info.magic(buf)) return { ok: false, status: 415, error: `This file does not look like a real ${ext.slice(1).toUpperCase()} file. Please check it and upload it again.` };
  return { ok: true, ext, family: info.family, mime: info.mime };
}

/** Extension-level size pre-check from the declared size (before reading the body into memory). */
export function declaredSizeError(filename: string, size: number): { status: 413; error: string } | null {
  const info = TYPES[path.extname(filename).toLowerCase()];
  const max = info ? MAX_BYTES[info.family] : ABSOLUTE_MAX_BYTES;
  return size > max ? { status: 413, error: `File is larger than ${max / MB} MB` } : null;
}
