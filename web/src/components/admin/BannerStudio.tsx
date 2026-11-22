"use client";
import { useState } from "react";
import { Sparkles, Trash2, Wand2 } from "lucide-react";
import { Alert, Badge, Button, Card, Field, Input, Textarea } from "@/components/ui";

interface B { id: string; title: string; subtitle: string; prompt: string; active: boolean; source: string; version: number }
const SOURCE_LABEL: Record<string, string> = { "nano-banana": "Nano Banana", "open-model": "Open-source model", template: "Template", upload: "Upload" };

export function BannerStudio({ initial, engine }: { initial: B[]; engine: string }) {
  const [banners, setBanners] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "red" | "green" | "yellow"; text: string } | null>(null);
  const [edit, setEdit] = useState<Record<string, string>>({});

  async function call(url: string, method: string, body?: unknown) {
    const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Request failed");
    return data;
  }

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy("new"); setMsg(null);
    try {
      const d = await call("/api/v1/admin/banners", "POST", { prompt: fd.get("prompt"), title: fd.get("title") || undefined, subtitle: fd.get("subtitle") || undefined });
      setBanners((b) => [...b, d.banner]);
      setMsg({ tone: d.note ? "yellow" : "green", text: d.note ?? "Banner created and live on your storefront." });
      (e.target as HTMLFormElement).reset();
    } catch (err) { setMsg({ tone: "red", text: (err as Error).message }); }
    setBusy(null);
  }

  async function applyEdit(b: B) {
    const prompt = edit[b.id]?.trim();
    if (!prompt) return;
    setBusy(b.id); setMsg(null);
    try {
      const d = await call("/api/v1/admin/banners", "POST", { prompt, editBannerId: b.id });
      setBanners((all) => all.map((x) => (x.id === b.id ? d.banner : x)));
      setEdit((s) => ({ ...s, [b.id]: "" }));
      setMsg({ tone: d.note ? "yellow" : "green", text: d.note ?? "Banner updated." });
    } catch (err) { setMsg({ tone: "red", text: (err as Error).message }); }
    setBusy(null);
  }

  async function toggle(b: B) {
    const d = await call(`/api/v1/admin/banners/${b.id}`, "PATCH", { active: !b.active }).catch((e) => setMsg({ tone: "red", text: e.message }));
    if (d) setBanners((all) => all.map((x) => (x.id === b.id ? d.banner : x)));
  }
  async function remove(b: B) {
    if (!confirm("Delete this banner?")) return;
    await call(`/api/v1/admin/banners/${b.id}`, "DELETE").then(() => setBanners((all) => all.filter((x) => x.id !== b.id))).catch((e) => setMsg({ tone: "red", text: e.message }));
  }

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <form onSubmit={create} className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2"><Field label="Describe your banner"><Textarea name="prompt" required minLength={3} rows={3} placeholder="Eid sale: 20% off flyers and business cards, festive gold and green, modern" /></Field><p className="mt-1 text-xs text-slate-500">Engine in use: <b>{engine}</b></p></div>
          <Field label="Headline (optional)"><Input name="title" maxLength={60} placeholder="Eid Mubarak — 20% off" /></Field>
          <Field label="Sub-headline (optional)"><Input name="subtitle" maxLength={120} placeholder="Order online, pick up today" /></Field>
          <div className="md:col-span-2"><Button disabled={busy === "new"} data-testid="generate-banner"><Sparkles className="h-4 w-4" />{busy === "new" ? "Generating…" : "Generate banner"}</Button></div>
        </form>
      </Card>

      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      <div className="grid gap-5 lg:grid-cols-2">
        {banners.map((b) => (
          <Card key={b.id} className="overflow-hidden" data-testid="banner-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/banners/${b.id}?v=${b.version}`} alt={b.title || "Banner"} className="aspect-[3/1] w-full bg-slate-100 object-cover" />
            <div className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0"><p className="truncate font-semibold">{b.title || "Untitled banner"}</p><p className="truncate text-xs text-slate-500">{b.prompt}</p></div>
                <div className="flex shrink-0 items-center gap-2"><Badge tone="purple">{SOURCE_LABEL[b.source] ?? b.source}</Badge><Badge tone={b.active ? "green" : "gray"}>{b.active ? "Live" : "Hidden"}</Badge></div>
              </div>
              <div className="flex gap-2">
                <Input value={edit[b.id] ?? ""} onChange={(e) => setEdit((s) => ({ ...s, [b.id]: e.target.value }))} placeholder="Edit with AI: make the background blue, add 'Free delivery'" />
                <Button variant="secondary" disabled={busy === b.id || !edit[b.id]?.trim()} onClick={() => applyEdit(b)}><Wand2 className="h-4 w-4" />{busy === b.id ? "…" : "Apply"}</Button>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => toggle(b)}>{b.active ? "Hide" : "Show"} on storefront</Button>
                <Button variant="ghost" className="text-red-600" onClick={() => remove(b)}><Trash2 className="h-4 w-4" />Delete</Button>
              </div>
            </div>
          </Card>
        ))}
        {!banners.length && <p className="text-sm text-slate-500">No banners yet — describe one above.</p>}
      </div>
    </div>
  );
}
