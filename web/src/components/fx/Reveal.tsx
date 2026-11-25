"use client";
import { useEffect, useRef } from "react";
import type { ComponentProps } from "react";
import { clsx } from "clsx";

/**
 * Plays a short rise animation when the element scrolls into view. The element is fully visible and in place at rest (no opacity:0),
 * so nothing depends on JavaScript or an observer. Skipped with reduced motion. Use below the fold only.
 */
export function Reveal({ className, delayMs = 0, ...p }: ComponentProps<"div"> & { delayMs?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight * 0.9) return; // already on screen at load: leave it alone
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      el.style.animationDelay = `${delayMs}ms`;
      el.classList.add("rise-run");
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [delayMs]);
  return <div ref={ref} className={clsx(className)} {...p} />;
}
