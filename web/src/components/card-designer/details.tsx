"use client";
/** The customer's details, typed once and shared by the template gallery and the AI panel. */
import { useRef } from "react";
import type { CardDetails } from "./kit";
import { INDUSTRIES } from "./catalog";

export interface DetailsState {
  name: string; title: string; company: string; phone: string; email: string; website: string; address: string;
  industry: string; style: string; logo?: string; colors: [string, string]; useColors: boolean;
}

export const INITIAL_DETAILS: DetailsState = {
  name: "", title: "", company: "", phone: "", email: "", website: "", address: "", industry: "", style: "modern",
  colors: ["#e11d48", "#0f172a"], useColors: false,
};

/** Placeholder text shown in the gallery until the customer types their own name. */
export const SAMPLE_DETAILS: CardDetails = {
  name: "Your Name", title: "Job Title", company: "Company Name", phone: "+971 50 000 0000", email: "you@company.com",
  website: "yourwebsite.com", address: "Dubai, UAE",
};

export function cleanDetails(s: DetailsState): CardDetails {
  const out: CardDetails = { name: s.name.trim() };
  for (const k of ["title", "company", "phone", "email", "website", "address", "industry", "style", "logo"] as const) {
    const v = s[k]?.trim(); if (v) out[k] = v;
  }
  if (s.useColors) out.colors = s.colors;
  return out;
}

export async function fileToDataUrl(file: File, maxPx = 800): Promise<string> {
  const raw = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
  if (file.type === "image/svg+xml") return raw;
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = raw; });
  const k = Math.min(1, maxPx / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/png");
}

const inp = "h-11 w-full rounded-lg border border-outline-variant bg-white px-3 text-sm text-on-surface outline-none focus:border-on-surface focus-visible:ring-2 focus-visible:ring-primary/40";

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`block min-w-0 ${className}`}><span className="mb-1 block text-xs font-medium text-on-surface-variant">{label}</span>{children}</label>;
}

export function DetailsForm({ value, onChange, showStyle = false, compact = false, idPrefix = "cd" }: {
  value: DetailsState; onChange: (v: DetailsState) => void; showStyle?: boolean; compact?: boolean; idPrefix?: string;
}) {
  const logoRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof DetailsState) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...value, [k]: ev.target.value });
  const grid = compact ? "grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4";
  return (
    <div className="space-y-3">
      <div className={`grid gap-3 ${grid}`}>
        <Field label="Full name *" className={compact ? "col-span-2" : "sm:col-span-2"}>
          <input id={`${idPrefix}-name`} data-testid="card-name" className={inp} value={value.name} onChange={set("name")} autoComplete="name" maxLength={80} />
        </Field>
        <Field label="Job title"><input className={inp} value={value.title} onChange={set("title")} maxLength={80} /></Field>
        <Field label="Company"><input className={inp} value={value.company} onChange={set("company")} maxLength={80} /></Field>
        <Field label="Phone"><input className={inp} type="tel" value={value.phone} onChange={set("phone")} autoComplete="tel" maxLength={40} /></Field>
        <Field label="Email"><input className={inp} type="email" value={value.email} onChange={set("email")} autoComplete="email" maxLength={80} /></Field>
        <Field label="Website (adds a QR code)"><input className={inp} value={value.website} onChange={set("website")} maxLength={100} /></Field>
        <Field label="Address (optional)"><input className={inp} value={value.address} onChange={set("address")} maxLength={160} /></Field>
        <Field label="Industry">
          <select className={inp} value={value.industry} onChange={set("industry")}>
            <option value="">Not set</option>
            {INDUSTRIES.map((i) => <option key={i.key} value={i.label}>{i.label}</option>)}
          </select>
        </Field>
        {showStyle && (
          <Field label="Design style">
            <select className={inp} value={value.style} onChange={set("style")}>
              {["modern", "minimal", "bold", "elegant", "corporate", "creative", "luxury"].map((s) => <option key={s} value={s}>{s[0]!.toUpperCase() + s.slice(1)}</option>)}
            </select>
          </Field>
        )}
        <div className="flex items-end gap-2">
          <button type="button" data-testid="card-logo-btn" onClick={() => logoRef.current?.click()}
            className="inline-flex h-11 min-w-0 flex-1 items-center justify-center truncate rounded-lg border border-dashed border-outline px-3 text-sm text-on-surface-variant hover:bg-surface-low">
            {value.logo ? "Logo added (change)" : "Upload logo"}
          </button>
          {value.logo && <button type="button" onClick={() => onChange({ ...value, logo: undefined })} className="h-11 shrink-0 rounded-lg border border-outline-variant px-3 text-sm text-on-surface-variant hover:bg-surface-low">Remove</button>}
          <input ref={logoRef} data-testid="card-logo-input" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" aria-label="Upload your logo"
            onChange={async (ev) => {
              const f = ev.target.files?.[0]; ev.target.value = "";
              if (!f) return;
              if (f.size > 5_000_000) return alert("Logo must be under 5 MB");
              const src = await fileToDataUrl(f, 600);
              if (src.length > 400_000) return alert("Logo is too detailed; please use a smaller PNG or SVG");
              onChange({ ...value, logo: src });
            }} />
        </div>
      </div>
      <div className="flex min-h-11 flex-wrap items-center gap-3 text-sm text-on-surface-variant">
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" className="h-5 w-5" checked={value.useColors} onChange={(e) => onChange({ ...value, useColors: e.target.checked })} /> Use my brand colours
        </label>
        {value.useColors && (
          <span className="flex items-center gap-2">
            <input type="color" aria-label="Main brand colour" value={value.colors[0]} onChange={(e) => onChange({ ...value, colors: [e.target.value, value.colors[1]] })} className="h-10 w-12 cursor-pointer rounded border border-outline-variant" />
            <input type="color" aria-label="Second brand colour" value={value.colors[1]} onChange={(e) => onChange({ ...value, colors: [value.colors[0], e.target.value] })} className="h-10 w-12 cursor-pointer rounded border border-outline-variant" />
          </span>
        )}
      </div>
    </div>
  );
}
