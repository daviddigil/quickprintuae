"use client";
import { useId } from "react";
import type { CardDesign } from "@/lib/types";
import { BLEED_MM, ElementSvg, getSide } from "./render";

/** Small decorative card preview (the surrounding control carries the accessible name). Unique clip ids, so many can share a page. */
export function CardThumb({ design, side = "front", className }: { design: CardDesign; side?: "front" | "back"; className?: string }) {
  const id = `ct${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const s = getSide(design, side);
  return (
    <svg viewBox={`0 0 ${design.widthMm} ${design.heightMm}`} aria-hidden="true" focusable="false" className={className}
      style={{ aspectRatio: `${design.widthMm} / ${design.heightMm}`, display: "block", width: "100%", height: "auto" }}>
      <defs><clipPath id={id}><rect width={design.widthMm} height={design.heightMm} rx={2} /></clipPath></defs>
      <g clipPath={`url(#${id})`}>
        <rect x={-BLEED_MM} y={-BLEED_MM} width={design.widthMm + 2 * BLEED_MM} height={design.heightMm + 2 * BLEED_MM} fill={s.background} />
        {s.elements.map((e) => <ElementSvg key={e.id} e={e} />)}
      </g>
    </svg>
  );
}
