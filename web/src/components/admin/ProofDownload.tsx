"use client";
import { useRef } from "react";
import { CardPreview } from "@/components/card-designer/CardDesigner";
import type { CardDesign } from "@/lib/types";

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
          <p className="mb-1 text-xs font-medium uppercase text-slate-500">{s} · {design.widthMm}×{design.heightMm} mm</p>
          <CardPreview design={design} side={s} className="w-full overflow-hidden rounded border shadow-sm" />
          <button type="button" onClick={() => download(s)} className="mt-2 text-sm font-medium text-brand-600 hover:underline">Download {s} proof (SVG)</button>
        </div>
      ))}
    </div>
  );
}
