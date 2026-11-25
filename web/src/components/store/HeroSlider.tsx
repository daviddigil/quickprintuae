"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface Slide { id: string; version: number; title: string; subtitle: string; linkUrl: string | null; ctaLabel: string; source: string }

/**
 * Offer slider for the storefront home. Autoplays (not with prefers-reduced-motion), pauses on hover/focus/touch,
 * swipe + arrows + dots. Uploaded images get the text overlay; AI/template images already contain their text.
 */
export function HeroSlider({ slides, shopName, intervalMs = 5500 }: { slides: Slide[]; shopName: string; intervalMs?: number }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const n = slides.length;
  const go = useCallback((to: number) => setI(((to % n) + n) % n), [n]);

  useEffect(() => {
    if (n < 2 || paused) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((x) => (x + 1) % n), intervalMs);
    return () => clearInterval(t);
  }, [n, paused, intervalMs]);

  if (!n) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 pt-4" aria-roledescription="carousel" aria-label={`${shopName} offers`} data-testid="hero-slider">
      <div
        className="group relative overflow-hidden rounded-2xl bg-surface-container"
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
        onTouchStart={(e) => { setPaused(true); touchX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => { if (touchX.current != null) { const dx = e.changedTouches[0].clientX - touchX.current; if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1)); } touchX.current = null; setPaused(false); }}
      >
        <div className="flex transition-transform duration-500 ease-out" style={{ transform: `translateX(-${i * 100}%)` }}>
          {slides.map((s, idx) => {
            const overlay = s.source === "upload" && (s.title || s.subtitle);
            const body = (
              <div className="relative aspect-[2/1] w-full sm:aspect-[3/1]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/banners/${s.id}?v=${s.version}`} alt={s.title || `${shopName} offer ${idx + 1}`} className="h-full w-full object-cover" loading={idx === 0 ? "eager" : "lazy"} draggable={false} />
                {overlay && (
                  <div className="absolute inset-0 flex flex-col justify-center bg-gradient-to-r from-black/65 via-black/30 to-transparent p-5 sm:p-10">
                    {s.title && <p className="max-w-md text-2xl font-extrabold leading-tight text-white drop-shadow sm:text-4xl">{s.title}</p>}
                    {s.subtitle && <p className="mt-2 max-w-md text-sm text-white/90 sm:text-lg">{s.subtitle}</p>}
                  </div>
                )}
                {s.linkUrl && s.ctaLabel && (
                  <span className="btn-store absolute bottom-4 left-5 rounded-lg px-4 py-2 text-sm font-semibold shadow sm:bottom-8 sm:left-10">{s.ctaLabel}</span>
                )}
              </div>
            );
            return (
              <div key={s.id} className="w-full shrink-0" role="group" aria-roledescription="slide" aria-label={`${idx + 1} of ${n}`} aria-hidden={idx !== i}>
                {s.linkUrl ? <Link href={s.linkUrl} tabIndex={idx === i ? 0 : -1} className="block" {...(s.linkUrl.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{body}</Link> : body}
              </div>
            );
          })}
        </div>

        {n > 1 && (
          <>
            <button type="button" aria-label="Previous offer" onClick={() => go(i - 1)} className="absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/85 p-2 shadow transition hover:bg-white group-hover:block"><ChevronLeft className="h-5 w-5" /></button>
            <button type="button" aria-label="Next offer" onClick={() => go(i + 1)} className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/85 p-2 shadow transition hover:bg-white group-hover:block"><ChevronRight className="h-5 w-5" /></button>
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2" role="tablist" aria-label="Choose offer">
              {slides.map((s, idx) => (
                <button key={s.id} type="button" role="tab" aria-selected={idx === i} aria-label={`Show offer ${idx + 1}`} onClick={() => go(idx)} data-testid="slider-dot" data-active={idx === i}
                  className={`h-2.5 rounded-full transition-all ${idx === i ? "w-6 bg-white" : "w-2.5 bg-white/60 hover:bg-white/80"}`} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
