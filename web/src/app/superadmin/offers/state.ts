import type { OfferState } from "@/lib/offers";
export const STATE_TONE: Record<OfferState, "gray" | "blue" | "green" | "yellow" | "red"> = { draft: "gray", scheduled: "blue", live: "green", paused: "yellow", ended: "gray", sold_out: "red" };
export const STATE_LABEL: Record<OfferState, string> = { draft: "Draft", scheduled: "Scheduled", live: "Live", paused: "Paused", ended: "Ended", sold_out: "Sold out" };
