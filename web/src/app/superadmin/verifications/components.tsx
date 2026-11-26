import { Badge } from "@/components/ui";
import { FLAG_LABELS, flagKind } from "@/lib/trust/verification";

export function FlagBadges({ flags }: { flags: string[] }) {
  if (!flags.length) return <span className="text-xs text-on-surface-variant">None</span>;
  return <span className="flex flex-wrap gap-1">{flags.map((f) => { const k = flagKind(f); return <Badge key={f} tone={k === "override" ? "gray" : "yellow"}>{k ? FLAG_LABELS[k] : f}</Badge>; })}</span>;
}

/** SLA: reviews should start within 24 hours; amber after 24 h, red after 48 h. Shown as text and colour. */
export function SlaBadge({ hours }: { hours: number }) {
  const tone = hours >= 48 ? "red" : hours >= 24 ? "yellow" : "green";
  const text = hours < 1 ? "under 1 h" : hours < 48 ? `${hours} h` : `${Math.floor(hours / 24)} d`;
  return <Badge tone={tone} dot>{text} waiting</Badge>;
}

