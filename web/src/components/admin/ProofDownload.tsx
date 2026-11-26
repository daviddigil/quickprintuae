"use client";
import { useEffect, useRef, useState } from "react";
import { CardPreview } from "@/components/card-designer/CardDesigner";
import { buildMerchProofSvg } from "@/lib/merch-proof";
import type { CardDesign, MockupArea } from "@/lib/types";

/** Shows card front/back and lets staff download each side as an SVG print proof. */
export function ProofDownload({ design, name }: { design: CardDesign; name: string }) {
  const ref = useRef<HTMLDivElement>(null);
  function download(side: "front" | "back") {
    const svg = ref.current?.querySelector(`[data-side="${side}"] svg`);
    if (!svg) return alert("Preview not available for download yet");
    const clone = svg.cloneNode(true) as SVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", `${design.widthMm}mm`);
    clone.setAttribute("height", `${design.heightMm}mm`);
    const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${clone.outerHTML}`], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}-${side}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  const sides: ("front" | "back")[] = design.back ? ["front", "back"] : ["front"];
  return (
    <div ref={ref} className="grid gap-4 sm:grid-cols-2">
      {sides.map((s) => (
        <div key={s} data-side={s}>
          <p className="mb-1 text-xs font-medium uppercase text-on-surface-variant">{s} · {design.widthMm}×{design.heightMm} mm</p>
          <CardPreview design={design} side={s} className="w-full overflow-hidden rounded border shadow-sm" />
          <button type="button" onClick={() => download(s)} className="mt-2 text-sm font-medium text-primary hover:underline">Download {s} proof (SVG)</button>
        </div>
      ))}
    </div>
  );
}

async function toDataUrl(url: string, filename?: string): Promise<string | null> {
  try {
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) return null;
    let blob = await res.blob();
    const ext = (filename ?? url).split("?")[0].split(".").pop()?.toLowerCase();
    if (!blob.type.startsWith("image/") || (ext === "svg" && blob.type !== "image/svg+xml")) {
      const type = ext === "svg" ? "image/svg+xml" : ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "";
      if (!type) return null;
      blob = new Blob([blob], { type });
    }
    return await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => resolve(null); r.readAsDataURL(blob); });
  } catch { return null; }
}
const imageSize = (href: string) => new Promise<{ width: number; height: number } | null>((resolve) => {
  const i = new Image(); i.onload = () => resolve({ width: i.naturalWidth || 800, height: i.naturalHeight || 600 }); i.onerror = () => resolve(null); i.src = href;
});

export interface MerchProofProps {
  name: string;
  orderNumber: string;
  productName: string;
  quantity: number;
  coverUrl?: string | null;
  mockup?: MockupArea | null;
  /** first uploaded artwork file of the line (admin download URL) */
  artwork?: { url: string; filename: string } | null;
  text: string[];
  details: string[];
  overlayText?: string;
}

/**
 * Print-ready proof for merchandise: artwork placed in the print area on the product photo, plus the personalisation text and
 * options as a sheet. Built in the browser as a self-contained SVG; also downloadable as PNG.
 */
export function MerchProof(p: MerchProofProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false, objectUrl: string | null = null;
    (async () => {
      const isImg = p.artwork && /\.(png|jpe?g|svg|webp|gif)$/i.test(p.artwork.filename);
      const [coverHref, artHref] = await Promise.all([p.coverUrl ? toDataUrl(p.coverUrl) : null, isImg && p.artwork ? toDataUrl(p.artwork.url, p.artwork.filename) : null]);
      const dims = coverHref ? await imageSize(coverHref) : null;
      const out = buildMerchProofSvg({
        orderNumber: p.orderNumber, productName: p.productName, quantity: p.quantity, mockup: p.mockup,
        cover: coverHref && dims ? { href: coverHref, ...dims } : null,
        artwork: p.artwork ? { href: artHref, filename: p.artwork.filename } : null,
        text: p.text, details: p.details, overlayText: p.overlayText,
      });
      if (cancelled) return;
      objectUrl = URL.createObjectURL(new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${out}`], { type: "image/svg+xml" }));
      setSvg(out); setHref(objectUrl);
    })();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [p.coverUrl, p.artwork, p.mockup, p.orderNumber, p.productName, p.quantity, p.text, p.details, p.overlayText]);

  function downloadPng() {
    if (!svg) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth * 2; c.height = img.naturalHeight * 2;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => { if (!b) return; const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `${p.name}-proof.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); });
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  return (
    <div data-testid="merch-proof">
      <p className="mb-1 text-xs font-medium uppercase text-on-surface-variant">Print proof</p>
      {href
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={href} alt={`Print proof for ${p.productName}: ${p.artwork ? `artwork ${p.artwork.filename}` : "no artwork"}${p.text.length ? `, ${p.text.join(", ")}` : ""}`} className="w-full max-w-2xl rounded border shadow-sm" />
        : <div className="flex aspect-[4/3] w-full max-w-2xl items-center justify-center rounded border bg-surface-low text-sm text-on-surface-variant">Building proof…</div>}
      <div className="mt-2 flex flex-wrap gap-4 text-sm font-medium">
        {href && <a href={href} download={`${p.name}-proof.svg`} className="inline-flex min-h-11 items-center text-primary hover:underline" data-testid="proof-svg">Download proof (SVG)</a>}
        {svg && <button type="button" onClick={downloadPng} className="inline-flex min-h-11 items-center text-primary hover:underline" data-testid="proof-png">Download proof (PNG)</button>}
      </div>
    </div>
  );
}
