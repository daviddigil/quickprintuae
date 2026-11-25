import "server-only";
import type { Tenant } from "@/db/schema";
import type { AgentResult } from "./agent";
import { checkoutMessage, type CartStore } from "./cart";
import { BUTTONS } from "./cart-math";

/** Deterministic replies for the interactive buttons we send (no model call needed, never misread). Returns null for unknown ids. */
export async function handleButton(tenant: Tenant, cart: CartStore, buttonId: string): Promise<AgentResult | null> {
  const base = { handoff: false, links: [] as string[], engine: "rule-based" as const };
  if (buttonId === BUTTONS.confirm) {
    const c = await checkoutMessage(tenant, cart);
    return { ...base, reply: c.ok ? c.message : "Your cart is empty — tell me what you'd like to print, e.g. \"500 business cards\".", links: c.links };
  }
  if (buttonId === BUTTONS.edit) return { ...base, reply: "Sure — tell me what to change, e.g. \"remove 2\", \"add 100 flyers\" or \"clear cart\"." };
  if (buttonId === BUTTONS.human) return { ...base, reply: "No problem — I'm passing you to a team member. They'll reply here shortly.", handoff: true };
  return null;
}
