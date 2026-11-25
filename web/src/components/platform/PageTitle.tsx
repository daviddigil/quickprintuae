export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-on-surface-variant">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export const TENANT_STATUS_TONE = {
  trial: "blue", active: "green", past_due: "yellow", suspended: "red", cancelled: "gray",
} as const;

export const fmtDate = (d?: Date | null) =>
  d ? new Intl.DateTimeFormat("en-AE", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Dubai" }).format(d) : "—";
export const fmtDateTime = (d?: Date | null) =>
  d ? new Intl.DateTimeFormat("en-AE", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" }).format(d) : "—";
