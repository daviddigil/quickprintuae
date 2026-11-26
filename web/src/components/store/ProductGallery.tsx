"use client";
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/components/ui";
import { ArtworkPreview, type ArtworkPreviewProps } from "./ArtworkPreview";

/** Photo gallery: cover first, thumbnails, arrow keys, swipe, and the live artwork preview on the cover photo. */
export function ProductGallery({ images, name, preview }: { images: string[]; name: string; preview?: Omit<ArtworkPreviewProps, "cover" | "name"> | null }) {
  const [active, setActive] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const total = images.length;
  const go = (n: number) => setActive(((n % total) + total) % total);

  // jump to the cover photo whenever the customer adds artwork or text, so the preview is what they see
  const previewKey = preview ? `${preview.artworkUrl ?? ""}|${preview.artworkIsPlaceholder ? 1 : 0}` : "";
  const [seenKey, setSeenKey] = useState(previewKey);
  if (seenKey !== previewKey) { setSeenKey(previewKey); if (previewKey !== "|0") setActive(0); }

  if (!total && !preview) return null;
  const showPreview = !!preview && active === 0;

  return (
    <section aria-roledescription="carousel" aria-label={`${name} photos`} className="min-w-0">
      <div
        tabIndex={total > 1 ? 0 : undefined}
        onKeyDown={(e) => { if (e.key === "ArrowRight") { e.preventDefault(); go(active + (document.dir === "rtl" ? -1 : 1)); } else if (e.key === "ArrowLeft") { e.preventDefault(); go(active + (document.dir === "rtl" ? 1 : -1)); } }}
        onPointerDown={(e) => { start.current = { x: e.clientX, y: e.clientY }; }}
        onPointerUp={(e) => {
          const s = start.current; start.current = null;
          if (!s || total < 2) return;
          const dx = e.clientX - s.x, dy = e.clientY - s.y;
          if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) go(active + (dx < 0 ? 1 : -1));
        }}
        className="group relative touch-pan-y rounded-shape-lg outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--store)]"
        data-testid="gallery-main">
        {showPreview
          ? <ArtworkPreview {...preview!} cover={images[0]} name={name} />
          : images[active]
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={images[active]} alt={`${name}, photo ${active + 1} of ${total}`} draggable={false} className="block max-h-[70vh] w-full select-none rounded-shape-lg bg-surface-low object-contain" />
            : <div className="aspect-square rounded-shape-lg bg-surface-low" />}
        {total > 1 && (
          <>
            <button type="button" onClick={() => go(active - 1)} aria-label="Previous photo" className="absolute start-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-on-surface shadow-elev-1 hover:bg-white rtl:rotate-180"><ChevronLeft className="h-5 w-5" /></button>
            <button type="button" onClick={() => go(active + 1)} aria-label="Next photo" className="absolute end-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-on-surface shadow-elev-1 hover:bg-white rtl:rotate-180"><ChevronRight className="h-5 w-5" /></button>
          </>
        )}
        {showPreview && (preview!.artworkUrl || preview!.artworkIsPlaceholder || preview!.text) && <span className="absolute bottom-2 start-2 rounded-full bg-inverse-surface px-2.5 py-1 text-xs font-medium text-white">Live preview</span>}
      </div>
      <p className="sr-only" aria-live="polite">{total > 1 ? `Photo ${active + 1} of ${total}` : ""}</p>
      {total > 1 && (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Choose a photo">
          {images.map((src, i) => (
            <li key={src + i} className="shrink-0">
              <button type="button" onClick={() => setActive(i)} aria-label={`Show photo ${i + 1} of ${total}`} aria-current={i === active ? "true" : undefined}
                className={cn("block h-16 w-16 overflow-hidden rounded-shape-md border-2 bg-surface-low", i === active ? "border-store" : "border-transparent hover:border-outline-variant")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
