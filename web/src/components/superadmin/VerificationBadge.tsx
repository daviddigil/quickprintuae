import { Badge } from "@/components/ui";

const MAP: Record<string, { tone: "green" | "blue" | "gray" | "red" | "yellow"; label: string }> = {
  verified: { tone: "green", label: "Verified" },
  pending_review: { tone: "blue", label: "In review" },
  needs_info: { tone: "yellow", label: "Info requested" },
  unverified: { tone: "gray", label: "Unverified" },
  rejected: { tone: "red", label: "Rejected" },
  expired: { tone: "red", label: "Licence expired" },
};
export function VerificationBadge({ status }: { status: string }) {
  const m = MAP[status] ?? MAP.unverified;
  return <Badge tone={m.tone} dot>{m.label}</Badge>;
}
