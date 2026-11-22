/**
 * Pickup / delivery time-slot generation. Pure (used on client for display and on server for validation).
 * All business hours are in UAE time (Asia/Dubai, UTC+4, no DST).
 */
import type { DeliverySettings } from "./types";

const UAE_OFFSET_MIN = 4 * 60;

export interface Slot { start: string; end: string; label: string }
export interface SlotDay { date: string; label: string; slots: Slot[] }

type SlotSettings = Pick<DeliverySettings, "openHour" | "closeHour" | "slotMinutes" | "closedWeekdays" | "scheduleDaysAhead">;

/** UTC Date for a given UAE-local Y-M-D and minutes since midnight */
function uaeToUtc(y: number, m: number, d: number, minutes: number) {
  return new Date(Date.UTC(y, m, d, 0, minutes) - UAE_OFFSET_MIN * 60_000);
}

const timeFmt = new Intl.DateTimeFormat("en-AE", { timeZone: "Asia/Dubai", hour: "numeric", minute: "2-digit", hour12: true });
const dayFmt = new Intl.DateTimeFormat("en-AE", { timeZone: "Asia/Dubai", weekday: "short", day: "numeric", month: "short" });

export const formatUaeTime = (d: Date | string) => timeFmt.format(new Date(d));
export const formatUaeDay = (d: Date | string) => dayFmt.format(new Date(d));
export const formatUaeDateTime = (d: Date | string) =>
  new Intl.DateTimeFormat("en-AE", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" }).format(new Date(d));

export function generateSlots(s: SlotSettings, leadHours: number, now = new Date()): SlotDay[] {
  const earliest = now.getTime() + Math.max(0, leadHours) * 3600_000;
  const slotMin = Math.max(15, s.slotMinutes || 60);
  const open = Math.max(0, Math.min(23, s.openHour ?? 9));
  const close = Math.max(open + 1, Math.min(24, s.closeHour ?? 21));
  const daysAhead = Math.max(1, s.scheduleDaysAhead ?? 7);
  // UAE-local "today"
  const local = new Date(now.getTime() + UAE_OFFSET_MIN * 60_000);
  const out: SlotDay[] = [];
  // search far enough to find `daysAhead` open days even with long lead times
  for (let i = 0; i < daysAhead + Math.ceil(leadHours / 24) + 7 && out.length < daysAhead; i++) {
    const day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + i));
    if (s.closedWeekdays?.includes(day.getUTCDay())) continue;
    const slots: Slot[] = [];
    for (let m = open * 60; m + slotMin <= close * 60; m += slotMin) {
      const start = uaeToUtc(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), m);
      if (start.getTime() < earliest) continue;
      const end = new Date(start.getTime() + slotMin * 60_000);
      slots.push({ start: start.toISOString(), end: end.toISOString(), label: `${formatUaeTime(start)} – ${formatUaeTime(end)}` });
    }
    if (!slots.length) continue;
    const ymd = day.toISOString().slice(0, 10);
    out.push({ date: ymd, label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : formatUaeDay(slots[0].start), slots });
  }
  return out;
}

export function findSlot(days: SlotDay[], startIso: string): Slot | undefined {
  const t = new Date(startIso).getTime();
  for (const d of days) for (const s of d.slots) if (new Date(s.start).getTime() === t) return s;
  return undefined;
}
