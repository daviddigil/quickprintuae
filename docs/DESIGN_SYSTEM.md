# QuickPrint design system

Apple restraint and Material 3 structure, with print-trade details. Tokens live in `web/src/app/globals.css`. Brand values are in `docs/BRAND.md`. A live reference for every component is at `/design-system` (noindex).

## Tokens
- **Colour roles** (`--md-*`, exposed as Tailwind colours): `primary`, `primary-container`, `secondary*`, `tertiary*`, `surface`, `surface-low`, `surface-container`, `surface-high`, `inverse-surface`, `on-surface`, `on-surface-variant`, `outline`, `outline-variant`. Semantic colours `success`, `warning`, `critical`, `info` (each with `-container` and `on-*`) are separate from the accent. Use `on-*` for text on that fill.
- **Ink accents** `ink-cyan|magenta|yellow|key`: small marks and category cues only.
- **Themes**: light in `:root`; dark in `.dark` and, for pages that opt in with `theme-auto`, under `prefers-color-scheme: dark`. Storefront tenant colour still uses `--store`, `.btn-store`, `.text-store`, `.bg-store-soft`.
- **Type**: system font stack only (no network fonts). Scale utilities: `text-display`, `text-headline`, `text-title`, plus Tailwind sizes. Headings use `text-wrap: balance`, paragraphs `pretty`; use `.measure` (65ch) for running text and `tabular-nums` for figures.
- **Shape**: `rounded-shape-xs|sm|md|lg|xl|2xl`. **Elevation**: `shadow-elev-1|2|3`. **Motion**: `--ease-emphasized`, `--ease-decelerate`, `--ease-spring`, `--dur-1..4`.
- Logical properties only (`ms-`, `pe-`, `start-`) so Arabic (RTL) works.

## Components (`@/components/ui`)
Button and LinkButton (`filled`, `tonal`, `outlined`, `text`, `dark`, `danger`, `store`; legacy `primary`, `secondary`, `ghost` still work; `size`, `pill`), Input, Select, Textarea, FloatingInput, Field (links label to control with a stable id), Card (`outlined|elevated|filled`), CardHeader, Badge (`dot`, ink tones), Alert, Stat (`tone`, `trend`, `spark`), Table, EmptyState, Tabs (all panels in the HTML), Segmented, Switch, SnackbarProvider and `useSnackbar`, Sparkline, Meter, CropMarks, ProofLabel, InkBar, RegMark.

CSS helpers: `state-layer` (8% hover, 10% focus and press), `crop-marks`, `halftone` (+ `halftone-fade`, `-x`, `-magenta`, `-cyan`), `proof-label`, `reg-mark`, `ink-underline`, `spotlight`.

Motion components (`@/components/fx`): SpotlightCard, CountUp, Reveal, SpecTicker.

Marketing (`@/components/platform`): MarketingNav and MarketingFooter (links come from `nav-links.ts`), LanguageSwitcher (hidden until `LOCALES_AVAILABLE` has `ar`), PricingTable, BillingExplainer, PlanComparison, and home sections in `home/`.

## Motion rules
1. Everything readable is visible on first paint. Animate from a visible resting state; never `opacity: 0` while waiting for an observer or script.
2. The H1 and hero never animate in. Scroll animations are below the fold only, and short (under 500ms).
3. All motion honours `prefers-reduced-motion` (the global CSS shortens animations, and the tickers become static lists).
4. No WebGL, canvas or heavy libraries on core pages. No layout shift.

## Craft rules
Left-aligned layouts with one real UI panel, vary surface/radius by role, use real print units (mm, gsm, A4, AED, 5% VAT) in examples, label sample data with `ProofLabel`. Show state in form (pill, stripe) as well as text. Write from the user's side of the screen: short, active, specific.

## Adding a component
1. Reuse tokens; no raw hex except print mock-ups that must look like paper.
2. Keep min touch target 44px on coarse pointers, visible focus, logical properties.
3. Server component by default; add `"use client"` only for state or effects.
4. Add it to `/design-system`. If it comes from a third party, keep the copyright header and list it in `web/THIRD_PARTY_NOTICES.md` (React Bits is MIT + Commons Clause: use inside the product only).
