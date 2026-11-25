"use client";
import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, ImagePlus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Alert, Badge, Button, Card, Field, Input, Textarea, cn } from "@/components/ui";
import { MAX_SLIDES, RECOMMENDED_SIZE, bannerState, dateToDubaiLocal, type BannerState } from "@/lib/banners";

interface B { id: string; title: string; subtitle: string; prompt: string; active: boolean; source: string; version: number; linkUrl: string; ctaLabel: string; startsAt: string | null; endsAt: string | null }
const SOURCE_LABEL: Record<string, string> = { "nano-banana": "Nano Banana", "open-model": "Open-source AI", template: "AI template", upload: "Your image" };
const STATE_BADGE: Record<BannerState, { tone: "green" | "yellow" | "gray" | "red"; label: string }> = {
  live: { tone: "green", label: "Live" }, scheduled: { tone: "yellow", label: "Scheduled" }, expired: { tone: "red", label: "Expired" }, hidden: { tone: "gray", label: "Hidden" },
};
const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export function BannerStudio({ initial, engine, aiEnabled, storeUrl }: { initial: B[]; engine: string; aiEnabled: boolean; storeUrl: string }) {
  const [slides, setSlides] = useState(initial);
  const [tab, setTab] = useState<"upload" | "ai">("upload");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "red" | "green" | "yellow"; text: string } | null>(null);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const full = slides.length >= MAX_SLIDES;

  async function json(url: string, method: string, body?: unknown) {
    const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Request failed");
    return data;
  }
  const fail = (e: unknown) => setMsg({ tone: "red", text: (e as Error).message });

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; const fd = new FormData(form);
    if (!(fd.get("file") as File)?.size) return setMsg({ tone: "red", text: "Choose an image first." });
    setBusy("upload"); setMsg(null);
    try {
      const res = await fetch("/api/v1/admin/banners/upload", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Upload failed");
      setSlides((s) => [...s, d.banner]); setMsg({ tone: "green", text: "Slide added. It's live on your storefront now (or on its start date)." });
      form.reset(); setPreview(null);
    } catch (err) { fail(err); }
    setBusy(null);
  }

  async function generate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget); setBusy("new"); setMsg(null);
    try {
      const d = await json("/api/v1/admin/banners", "POST", { prompt: fd.get("prompt"), title: fd.get("title") || undefined, subtitle: fd.get("subtitle") || undefined });
      setSlides((b) => [...b, d.banner]); setMsg({ tone: d.note ? "yellow" : "green", text: d.note ?? "Slide created and live on your storefront." });
      (e.target as HTMLFormElement).reset();
    } catch (err) { fail(err); }
    setBusy(null);
  }

  async function applyEdit(b: B) {
    const prompt = edit[b.id]?.trim(); if (!prompt) return;
    setBusy(b.id); setMsg(null);
    try {
      const d = await json("/api/v1/admin/banners", "POST", { prompt, editBannerId: b.id });
      setSlides((all) => all.map((x) => (x.id === b.id ? d.banner : x))); setEdit((s) => ({ ...s, [b.id]: "" }));
      setMsg({ tone: d.note ? "yellow" : "green", text: d.note ?? "Slide updated." });
    } catch (err) { fail(err); }
    setBusy(null);
  }

  async function saveDetails(b: B, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd = new FormData(e.currentTarget); setBusy("save-" + b.id); setMsg(null);
    try {
      const d = await json(`/api/v1/admin/banners/${b.id}`, "PATCH", {
        title: String(fd.get("title") ?? ""), subtitle: String(fd.get("subtitle") ?? ""), linkUrl: String(fd.get("linkUrl") ?? "") || null, ctaLabel: String(fd.get("ctaLabel") ?? ""),
        startsAt: (fd.get("startsAt") as string) || null, endsAt: (fd.get("endsAt") as string) || null,
      });
      setSlides((all) => all.map((x) => (x.id === b.id ? { ...x, ...d.banner, linkUrl: d.banner.linkUrl ?? "", startsAt: d.banner.startsAt, endsAt: d.banner.endsAt } : x)));
      setMsg({ tone: "green", text: "Slide details saved." }); setOpen(null);
    } catch (err) { fail(err); }
    setBusy(null);
  }

  async function toggle(b: B) {
    try { const d = await json(`/api/v1/admin/banners/${b.id}`, "PATCH", { active: !b.active }); setSlides((all) => all.map((x) => (x.id === b.id ? { ...x, active: d.banner.active } : x))); } catch (err) { fail(err); }
  }
  async function remove(b: B) {
    if (!confirm("Delete this slide?")) return;
    try { await json(`/api/v1/admin/banners/${b.id}`, "DELETE"); setSlides((all) => all.filter((x) => x.id !== b.id)); } catch (err) { fail(err); }
  }
  async function move(idx: number, dir: -1 | 1) {
    const j = idx + dir; if (j < 0 || j >= slides.length) return;
    const next = [...slides]; [next[idx], next[j]] = [next[j], next[idx]]; setSlides(next);
    try { await json("/api/v1/admin/banners/reorder", "POST", { ids: next.map((x) => x.id) }); } catch (err) { fail(err); }
  }

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="inline-flex rounded-lg bg-surface-container p-1 text-sm font-medium">
            <button type="button" onClick={() => setTab("upload")} className={cn("rounded-md px-3 py-1.5", tab === "upload" ? "bg-white shadow-sm" : "text-on-surface-variant")} data-testid="tab-upload"><ImagePlus className="mr-1.5 inline h-4 w-4" />Upload your image</button>
            {aiEnabled && <button type="button" onClick={() => setTab("ai")} className={cn("rounded-md px-3 py-1.5", tab === "ai" ? "bg-white shadow-sm" : "text-on-surface-variant")} data-testid="tab-ai"><Sparkles className="mr-1.5 inline h-4 w-4" />Create with AI</button>}
          </div>
          <a href={storeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-on-surface-variant hover:text-on-surface">View storefront <ExternalLink className="h-3.5 w-3.5" /></a>
        </div>

        {full && <Alert tone="yellow">You have reached the limit of {MAX_SLIDES} slides. Delete one to add another.</Alert>}

        {tab === "upload" && !full && (
          <form onSubmit={upload} className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-outline-variant bg-surface-low p-6 text-center hover:border-outline">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="Preview" className="max-h-40 rounded-lg object-contain" />
                ) : <ImagePlus className="h-8 w-8 text-outline" />}
                <span className="text-sm font-medium">{preview ? "Choose a different image" : "Click to choose your offer image"}</span>
                <span className="text-xs text-on-surface-variant">Recommended {RECOMMENDED_SIZE}</span>
                <input ref={fileRef} name="file" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" data-testid="slide-file"
                  onChange={(e) => { const f = e.target.files?.[0]; setPreview(f ? URL.createObjectURL(f) : null); }} />
              </label>
            </div>
            <Field label="Headline" hint="(shown over your image)"><Input name="title" maxLength={60} placeholder="Eid Mubarak — 20% off" /></Field>
            <Field label="Sub-headline" hint="(optional)"><Input name="subtitle" maxLength={120} placeholder="Order online, pick up today" /></Field>
            <Field label="Button label" hint="(optional)"><Input name="ctaLabel" maxLength={24} placeholder="Shop flyers" /></Field>
            <Field label="Button / slide link" hint="(page on your store or https:// address)"><Input name="linkUrl" maxLength={300} placeholder="/s/yourshop/p/flyers" /></Field>
            <Field label="Show from" hint="(optional, UAE time)"><Input name="startsAt" type="datetime-local" /></Field>
            <Field label="Hide after" hint="(optional, UAE time)"><Input name="endsAt" type="datetime-local" /></Field>
            <div className="md:col-span-2"><Button disabled={busy === "upload"} data-testid="upload-slide"><ImagePlus className="h-4 w-4" />{busy === "upload" ? "Uploading…" : "Add slide"}</Button></div>
          </form>
        )}

        {tab === "ai" && aiEnabled && !full && (
          <form onSubmit={generate} className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2"><Field label="Describe your offer"><Textarea name="prompt" required minLength={3} rows={3} placeholder="Eid sale: 20% off flyers and business cards, festive gold and green, modern" /></Field><p className="mt-1 text-xs text-on-surface-variant">AI engine in use: <b>{engine}</b></p></div>
            <Field label="Headline (optional)"><Input name="title" maxLength={60} placeholder="Eid Mubarak — 20% off" /></Field>
            <Field label="Sub-headline (optional)"><Input name="subtitle" maxLength={120} placeholder="Order online, pick up today" /></Field>
            <div className="md:col-span-2"><Button disabled={busy === "new"} data-testid="generate-banner"><Sparkles className="h-4 w-4" />{busy === "new" ? "Generating…" : "Generate slide"}</Button></div>
          </form>
        )}
      </Card>

      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      <div className="space-y-4">
        {slides.map((b, idx) => {
          const st = STATE_BADGE[bannerState({ active: b.active, startsAt: b.startsAt, endsAt: b.endsAt })];
          const canAi = b.source !== "upload";
          return (
            <Card key={b.id} className="overflow-hidden" data-testid="banner-card">
              <div className="grid gap-0 md:grid-cols-[320px_1fr]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/banners/${b.id}?v=${b.version}`} alt={b.title || "Slide"} className="aspect-[3/1] w-full bg-surface-container object-cover md:aspect-auto md:h-full" />
                <div className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0"><p className="truncate font-semibold">{b.title || "Untitled slide"}</p>
                      <p className="text-xs text-on-surface-variant">{b.startsAt || b.endsAt ? `${b.startsAt ? "From " + fmt(b.startsAt) : ""}${b.startsAt && b.endsAt ? " · " : ""}${b.endsAt ? "Until " + fmt(b.endsAt) : ""} (UAE time)` : "Always on"}</p></div>
                    <div className="flex items-center gap-2"><Badge tone="purple">{SOURCE_LABEL[b.source] ?? b.source}</Badge><Badge tone={st.tone}>{st.label}</Badge></div>
                  </div>
                  {canAi && aiEnabled && (
                    <div className="flex gap-2">
                      <Input value={edit[b.id] ?? ""} onChange={(e) => setEdit((s) => ({ ...s, [b.id]: e.target.value }))} placeholder="Edit with AI: make the background blue, add 'Free delivery'" />
                      <Button variant="secondary" disabled={busy === b.id || !edit[b.id]?.trim()} onClick={() => applyEdit(b)}><Wand2 className="h-4 w-4" />{busy === b.id ? "…" : "Apply"}</Button>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button variant="ghost" onClick={() => move(idx, -1)} disabled={idx === 0} aria-label="Move earlier"><ArrowUp className="h-4 w-4" /></Button>
                    <Button variant="ghost" onClick={() => move(idx, 1)} disabled={idx === slides.length - 1} aria-label="Move later"><ArrowDown className="h-4 w-4" /></Button>
                    <Button variant="ghost" onClick={() => setOpen(open === b.id ? null : b.id)} data-testid="edit-details">{open === b.id ? "Close" : "Edit details & dates"}</Button>
                    <Button variant="ghost" onClick={() => toggle(b)}>{b.active ? "Hide" : "Show"}</Button>
                    <Button variant="ghost" className="text-critical" onClick={() => remove(b)}><Trash2 className="h-4 w-4" />Delete</Button>
                  </div>
                  {open === b.id && (
                    <form onSubmit={(e) => saveDetails(b, e)} className="grid gap-3 rounded-lg border border-outline-variant bg-surface-low p-3 sm:grid-cols-2">
                      <Field label="Headline"><Input name="title" defaultValue={b.title} maxLength={60} /></Field>
                      <Field label="Sub-headline"><Input name="subtitle" defaultValue={b.subtitle} maxLength={120} /></Field>
                      <Field label="Button label"><Input name="ctaLabel" defaultValue={b.ctaLabel} maxLength={24} /></Field>
                      <Field label="Link"><Input name="linkUrl" defaultValue={b.linkUrl} maxLength={300} placeholder="/s/yourshop/p/flyers" /></Field>
                      <Field label="Show from (UAE time)"><Input name="startsAt" type="datetime-local" defaultValue={dateToDubaiLocal(b.startsAt)} /></Field>
                      <Field label="Hide after (UAE time)"><Input name="endsAt" type="datetime-local" defaultValue={dateToDubaiLocal(b.endsAt)} /></Field>
                      <div className="sm:col-span-2"><Button disabled={busy === "save-" + b.id}>{busy === "save-" + b.id ? "Saving…" : "Save details"}</Button></div>
                    </form>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
        {!slides.length && <p className="text-sm text-on-surface-variant">No slides yet. Upload an image or describe an offer above — your storefront shows the normal headline until you add one.</p>}
      </div>
    </div>
  );
}
