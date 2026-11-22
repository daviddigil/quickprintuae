import { Alert } from "@/components/ui";
export function Flash({ sp }: { sp: { ok?: string; error?: string } }) {
  if (sp.error) return <div className="mb-4"><Alert tone="red">{sp.error}</Alert></div>;
  if (sp.ok) return <div className="mb-4"><Alert tone="green">{sp.ok}</Alert></div>;
  return null;
}
