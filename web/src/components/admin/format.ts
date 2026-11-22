import { format } from "date-fns";
export const dubai = (d: Date | string | null | undefined, fmt = "d MMM yyyy, HH:mm") => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  // Render in Gulf Standard Time (UTC+4, no DST)
  const shifted = new Date(date.getTime() + (4 * 60 + date.getTimezoneOffset()) * 60_000);
  return format(shifted, fmt);
};
export const slotLabel = (s: Date | null, e: Date | null) => (s ? `${dubai(s, "EEE d MMM, HH:mm")}${e ? `–${dubai(e, "HH:mm")}` : ""}` : "ASAP");
export const waLink = (phone: string, text: string) => `https://wa.me/${phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(text)}`;
