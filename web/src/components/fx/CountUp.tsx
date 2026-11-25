"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Number that settles to its value when it scrolls into view. The server-rendered HTML and the resting state already show the final
 * value (readable first paint, crawlable); the animation only runs from ~80% up to the value, and never with reduced motion.
 */
export function CountUp({ value, decimals = 0, prefix = "", suffix = "", durationMs = 900, className, locale = "en-AE" }: { value: number; decimals?: number; prefix?: string; suffix?: string; durationMs?: number; className?: string; locale?: string }) {
  const fmt = (n: number) => `${prefix}${n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
  const [shown, setShown] = useState(value);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    let raf = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      const from = value * 0.8, t0 = performance.now();
      const tick = (t: number) => {
        const k = Math.min(1, (t - t0) / durationMs), eased = 1 - Math.pow(1 - k, 3);
        setShown(from + (value - from) * eased);
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.6 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [value, durationMs]);
  return <span ref={ref} className={className} style={{ fontVariantNumeric: "tabular-nums" }} aria-label={fmt(value)}><span aria-hidden>{fmt(shown)}</span></span>;
}
