import type { ReactNode } from "react";

const P: Record<string, ReactNode> = {
  arrow: <path d="M4 10h12M11 5l5 5-5 5" />,
  check: <path d="M4 10.5l4 3.5 8-8.5" />,
  card: <><rect x="2.5" y="4.5" width="15" height="11" rx="2" /><path d="M2.5 8h15M5.5 12h3" /></>,
  receipt: <><path d="M5 2.5h10v15l-2-1.5-1.5 1.5L10 16l-1.5 1.5L7 16l-2 1.5z" /><path d="M7.5 7h5M7.5 10h5" /></>,
  truck: <><path d="M2.5 5.5h9v8h-9zM11.5 8.5h3.5l2.5 2.5v2.5h-6" /><circle cx="6" cy="14.5" r="1.5" /><circle cx="14" cy="14.5" r="1.5" /></>,
  chat: <><path d="M3 4.5h14v9H8.5L5 16.5v-3H3z" /><path d="M6.5 8h7M6.5 10.5h4" /></>,
  qr: <><rect x="3" y="3" width="5" height="5" rx="0.8" /><rect x="12" y="3" width="5" height="5" rx="0.8" /><rect x="3" y="12" width="5" height="5" rx="0.8" /><path d="M12 12h2v2h-2zM16 12h1v1M12 16h2M16 15v2" /></>,
  image: <><rect x="2.5" y="3.5" width="15" height="13" rx="2" /><circle cx="7" cy="8" r="1.3" /><path d="M3 14.5l4-3.5 3 2.5 3-3 4 3.5" /></>,
  tag: <><path d="M3 3.5h7l7 7-6.5 6.5-7-7z" /><circle cx="7" cy="7.5" r="1" /></>,
  layers: <><path d="M10 3l7.5 4-7.5 4-7.5-4z" /><path d="M2.5 11l7.5 4 7.5-4" /></>,
};

export type IconName = keyof typeof P;

/** Small line icons (20px grid, currentColor). Decorative unless `label` is given. */
export function Icon({ name, className = "size-5", label }: { name: IconName; className?: string; label?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}>
      {P[name]}
    </svg>
  );
}
