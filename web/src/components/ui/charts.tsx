import { useId } from "react";

const toneVar = { primary: "var(--md-primary)", success: "var(--md-success)", info: "var(--md-info)", warning: "var(--md-warning)", critical: "var(--md-critical)" } as const;

/**
 * Sparkline with an area fill, a faint grid, and an emphasised end point.
 * Always give it an ariaLabel that states the trend in words (charts are not the only carrier of meaning).
 */
export function Sparkline({ data, tone = "primary", ariaLabel, className, grid = true }: { data: number[]; tone?: keyof typeof toneVar; ariaLabel: string; className?: string; grid?: boolean }) {
  const gid = useId().replace(/:/g, "");
  const W = 120, H = 40, padX = 4, padY = 6;
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
  const pts = data.map((v, i) => [padX + (i * (W - padX * 2)) / Math.max(1, data.length - 1), H - padY - ((v - min) / span) * (H - padY * 2)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${H} L${pts[0][0].toFixed(1)},${H} Z`;
  const [ex, ey] = pts[pts.length - 1];
  const c = toneVar[tone];
  return (
    <svg role="img" aria-label={ariaLabel} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className ?? "h-full w-full"}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c} stopOpacity="0.28" /><stop offset="1" stopColor={c} stopOpacity="0" />
        </linearGradient>
      </defs>
      {grid && [0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--md-outline-variant)" strokeWidth="0.5" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />)}
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={c} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={ex} cy={ey} r="5" fill={c} opacity="0.18" />
      <circle cx={ex} cy={ey} r="2.4" fill={c} stroke="var(--md-surface-container-lowest)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Horizontal meter (e.g. plan usage). Colour reflects severity; the numbers sit next to it. */
export function Meter({ value, max, label, tone }: { value: number; max: number; label: string; tone?: "primary" | "warning" | "critical" }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  const t = tone ?? (pct >= 95 ? "critical" : pct >= 80 ? "warning" : "primary");
  const bar = { primary: "bg-primary", warning: "bg-warning", critical: "bg-critical" }[t];
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-on-surface-variant"><span>{label}</span><span className="tabular-nums">{value.toLocaleString("en-AE")} / {max.toLocaleString("en-AE")}</span></div>
      <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className="h-2 overflow-hidden rounded-full bg-surface-container-high">
        <div className={`h-full rounded-full ${bar} transition-[width] duration-(--dur-3) ease-emphasized`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
