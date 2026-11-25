"use client";
import type { ComponentProps, PointerEvent } from "react";
import { clsx } from "clsx";

/**
 * Card with a soft highlight that follows the pointer (fine pointers only; static on touch and with reduced motion).
 * Hand-written. The idea (a pointer-following spotlight on a card) is a common pattern; React Bits' SpotlightCard was reviewed as a reference
 * (https://github.com/DavidHDev/react-bits, MIT + Commons Clause) but no code was copied. See THIRD_PARTY_NOTICES.md.
 */
export function SpotlightCard({ className, onPointerMove, ...p }: ComponentProps<"div">) {
  function move(e: PointerEvent<HTMLDivElement>) {
    onPointerMove?.(e);
    if (e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  }
  return <div className={clsx("spotlight", className)} onPointerMove={move} {...p} />;
}
