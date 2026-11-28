import Link from "next/link";

/**
 * The official QuickPrint UAE logo (files in public/brand, built from Quickprint_logos by scripts/build-brand-assets.py).
 * horizontal = header/footer/auth, stacked = hero/poster, signature = tight one-line spaces, mark = icon only.
 * Light-background art by default; `onDark` swaps to the white-wordmark versions. Plain <img>/<picture> with explicit
 * width and height (no layout shift, no dependency on Next image optimisation in the Docker standalone build).
 */
export type LogoVariant = "horizontal" | "stacked" | "signature" | "mark";

const ART: Record<LogoVariant, { ratio: number; widths: number[]; webp: boolean }> = {
  horizontal: { ratio: 1200 / 287, widths: [240, 480, 960], webp: true },
  stacked: { ratio: 1024 / 876, widths: [320, 640], webp: true },
  signature: { ratio: 840 / 123, widths: [280, 560], webp: true },
  mark: { ratio: 1, widths: [64, 128, 256], webp: false },
};

export function LogoImage({ variant = "horizontal", onDark = false, height = 36, className = "", priority = false, alt = "QuickPrint UAE" }: {
  variant?: LogoVariant; onDark?: boolean; height?: number; className?: string; priority?: boolean; alt?: string;
}) {
  const a = ART[variant];
  const base = variant === "mark" ? "mark" : `${variant}${onDark ? "-dark" : ""}`;
  const width = Math.round(height * a.ratio);
  const set = (ext: string) => a.widths.map((w) => `/brand/${base}-${w}.${ext} ${w}w`).join(", ");
  const mid = a.widths[Math.min(1, a.widths.length - 1)];
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/brand/${base}-${mid}.png`} srcSet={set("png")} sizes={`${width}px`} width={width} height={height} alt={alt}
      decoding="async" {...(priority ? { fetchPriority: "high" as const } : { loading: "lazy" as const })} className={`block h-auto max-w-full ${className}`} style={{ height, width }} />
  );
  return a.webp ? <picture><source type="image/webp" srcSet={set("webp")} sizes={`${width}px`} />{img}</picture> : img;
}

export function Logo({ className = "", href = "/", onDark = false, label = "QuickPrint UAE home", variant = "horizontal", height = 36, priority = false }: {
  className?: string; href?: string; onDark?: boolean; label?: string; variant?: LogoVariant; height?: number; priority?: boolean;
}) {
  // On `.theme-auto` pages the system theme can be dark, so render both artworks and let CSS (globals.css: .logo-art-*) show the right one.
  const both = !onDark && variant !== "mark";
  return (
    <Link href={href} title={label} className={`inline-flex items-center ${className}`}>
      {both ? (
        <>
          <span className="logo-art-light"><LogoImage variant={variant} height={height} priority={priority} /></span>
          <span className="logo-art-dark"><LogoImage variant={variant} onDark height={height} priority={priority} /></span>
        </>
      ) : (
        <LogoImage variant={variant} onDark={onDark} height={height} priority={priority} />
      )}
    </Link>
  );
}
