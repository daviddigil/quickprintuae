"use client";
import { useState } from "react";
import { FileText } from "lucide-react";
import type { MockupArea } from "@/lib/types";

export interface ArtworkPreviewProps {
  /** cover photo of the product (the mockup area is a percentage of it); without one the preview falls back to a neutral card */
  cover?: string | null;
  /** product name, used for the accessible description */
  name: string;
  mockup: MockupArea;
  /** blob/object URL of the uploaded image artwork (png/jpg/svg). Not set for PDFs. */
  artworkUrl?: string | null;
  artworkName?: string | null;
  /** an artwork file was uploaded but cannot be drawn (PDF): a placeholder is shown in the print area */
  artworkIsPlaceholder?: boolean;
  /** optional text overlay (first personalisation text field) */
  text?: string;
  className?: string;
}

const clamp = (n: number) => Math.min(100, Math.max(0, Number.isFinite(n) ? n : 0));

/**
 * Client-side only preview: draws the customer's artwork (and optional text) inside the product's print area over the cover photo.
 * Pure CSS (no canvas, no server rendering): the area is positioned in % of the photo and the artwork uses object-fit: contain.
 */
export function ArtworkPreview({ cover, name, mockup, artworkUrl, artworkName, artworkIsPlaceholder, text, className }: ArtworkPreviewProps) {
  const [ratio, setRatio] = useState<number | null>(null);
  const x = clamp(mockup.x), y = clamp(mockup.y), w = clamp(Math.min(mockup.w, 100 - x)), h = clamp(Math.min(mockup.h, 100 - y));
  const trimmed = text?.trim() ?? "";
  const label = `${name} preview${artworkName ? ` with your artwork ${artworkName}` : ""}${trimmed ? `${artworkName ? " and" : " with"} the text "${trimmed}"` : ""}${!artworkName && !trimmed ? ": your artwork will appear in the print area" : ""}`;

  return (
    <div role="img" aria-label={label} data-testid="artwork-preview"
      className={`relative w-full overflow-hidden rounded-shape-lg bg-surface-low ${className ?? ""}`}
      style={{ containerType: "inline-size", aspectRatio: cover ? (ratio ?? 1) : 1 }}>
      {cover
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={cover} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-fill" onLoad={(e) => { const i = e.currentTarget; if (i.naturalWidth && i.naturalHeight) setRatio(i.naturalWidth / i.naturalHeight); }} />
        : null}
      <div aria-hidden="true" data-testid="artwork-area"
        className="absolute flex flex-col items-center justify-center gap-[1cqw] overflow-hidden rounded-[0.5cqw] outline-dashed outline-1 outline-white/90"
        style={{ insetInlineStart: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%`, boxShadow: "0 0 0 1px rgb(0 0 0 / .25)" }}>
        {artworkUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={artworkUrl} alt="" className="min-h-0 w-full flex-1 object-contain" />
          : artworkIsPlaceholder
            ? <span className="flex min-h-0 flex-1 flex-col items-center justify-center bg-white/80 px-[1cqw] text-center text-[#1d1e3a]" style={{ fontSize: "max(9px, 2.2cqw)" }}><FileText className="h-[40%] w-auto max-w-full" strokeWidth={1.5} />PDF artwork</span>
            : trimmed ? null : <span className="m-auto text-center text-white" style={{ fontSize: "max(9px, 2.2cqw)", textShadow: "0 0 3px rgb(0 0 0 / .8)" }}>Your artwork here</span>}
        {trimmed && (
          <span className="max-w-full shrink-0 break-words px-[1cqw] text-center font-semibold leading-tight text-[#111827]"
            style={{ fontSize: "max(10px, 3.2cqw)", textShadow: "0 0 3px rgb(255 255 255 / .9)", ...(artworkUrl || artworkIsPlaceholder ? {} : { margin: "auto" }) }}>{trimmed}</span>
        )}
      </div>
    </div>
  );
}
