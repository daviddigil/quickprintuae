"use client";
import { useEffect, useState } from "react";
import { fillOffer, offerCopy } from "@/lib/i18n/offers";

/** "Ends 30 Nov 2026" on the server render; a live "Ends in 3d 4h" once mounted (no hydration mismatch). */
export function Countdown({ endsAt, locale, dateLabel }: { endsAt: string; locale: string; dateLabel: string }) {
  const c = offerCopy(locale);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const left = new Date(endsAt).getTime() - (now ?? 0);
  if (now == null || left > 7 * 86400_000) return <>{fillOffer(c.endsOn, { date: dateLabel })}</>;
  if (left <= 0) return <>{c.endsToday}</>;
  const d = Math.floor(left / 86400_000), h = Math.floor((left % 86400_000) / 3600_000), m = Math.floor((left % 3600_000) / 60_000);
  const time = d > 0 ? `${d}${c.days} ${h}${c.hours}` : `${h}${c.hours} ${m}${c.minutes}`;
  return <span dir="ltr" className="tabular-nums">{fillOffer(c.endsIn, { time })}</span>;
}
