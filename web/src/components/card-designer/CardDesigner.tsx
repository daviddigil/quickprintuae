"use client";
import type { CardDesign } from "@/lib/types";

/**
 * CONTRACT (implemented by the integrations agent):
 * Full business-card editor (front/back, text/shapes/logo/QR, drag to move) with an
 * "AI design" panel that POSTs to /api/v1/ai/business-card { store, details } -> { designs: CardDesign[] }.
 * Calls onChange on every edit. Storefront embeds it on the business card product page.
 */
export interface CardDesignerProps {
  store: string;               // tenant slug
  initial?: CardDesign;
  widthMm?: number;            // from selected card size
  heightMm?: number;
  doubleSided?: boolean;
  aiEnabled: boolean;
  onChange: (d: CardDesign) => void;
}

export function CardDesigner(_p: CardDesignerProps) {
  return <div className="rounded-lg border p-6 text-sm text-slate-500">Designer loading…</div>;
}

/** Static SVG renderer (used for thumbnails in cart/admin and print proof). */
export function CardPreview({ design, side = "front", className }: { design: CardDesign; side?: "front" | "back"; className?: string }) {
  void design; void side;
  return <div className={className} />;
}
