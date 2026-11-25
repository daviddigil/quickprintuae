/** Pay-as-you-go usage billing: pure maths, safe on client and server. */
export const USAGE_KINDS = [
  { kind: "whatsapp_message_out", label: "WhatsApp messages sent (Meta API)", unit: "message" },
  { kind: "ai_chat_turn", label: "AI chat replies", unit: "reply" },
  { kind: "ai_card_design", label: "AI business-card designs", unit: "design" },
  { kind: "ai_banner", label: "AI banners generated", unit: "banner" },
] as const;
export type UsageKind = (typeof USAGE_KINDS)[number]["kind"];

export interface UsageLine { kind: string; label: string; unit: string; qty: number; included: number; billedQty: number; rate: number; amount: number }

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** counts: billable events per kind this period; rates: AED per unit; allowances: free units per kind (from the plan). */
export function computeUsageCharges(
  counts: Record<string, number>,
  rates: Record<string, number>,
  allowances: Record<string, number> = {},
): { lines: UsageLine[]; total: number } {
  const lines: UsageLine[] = [];
  for (const k of USAGE_KINDS) {
    const qty = Math.max(0, Math.floor(counts[k.kind] ?? 0));
    if (!qty) continue;
    const included = Math.max(0, Math.floor(allowances[k.kind] ?? 0));
    const billedQty = Math.max(0, qty - included);
    const rate = Math.max(0, rates[k.kind] ?? 0);
    lines.push({ kind: k.kind, label: k.label, unit: k.unit, qty, included: Math.min(included, qty), billedQty, rate, amount: r2(billedQty * rate) });
  }
  return { lines, total: r2(lines.reduce((s, l) => s + l.amount, 0)) };
}
