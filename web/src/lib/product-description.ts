/** Deterministic fallback for the "Write description" helper (used when there is no AI key). A draft the owner edits. */
export function fallbackDescription(b: { name: string; category?: string; options?: string[]; personalised?: boolean }): string {
  const opts = (b.options ?? []).filter(Boolean).slice(0, 3);
  const parts = [`${b.name}${b.category ? ` from our ${b.category.toLowerCase()} range` : ""}, made to order in the UAE.`];
  if (b.personalised) parts.push("Add your own name, text or artwork and we will print it for you.");
  if (opts.length) parts.push(`Choose your ${opts.join(", ").toLowerCase()}.`);
  parts.push("Order more to save with quantity pricing.");
  return parts.join(" ");
}
