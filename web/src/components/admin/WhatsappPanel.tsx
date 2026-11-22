"use client";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Textarea } from "@/components/ui";
import { WhatsappConnect } from "./WhatsappConnect";

interface Account { displayPhone: string | null; status: string; mode: string; aiEnabled: boolean; greeting: string; handoffMinutes: number }
interface Conv { id: string; customerWaId: string; customerName: string | null; lastMessageAt: string; aiPausedUntil: string | null }
interface Msg { id: string; direction: string; source: string; body: string; status: string | null; createdAt: string }
const SRC: Record<string, { label: string; tone: "gray" | "green" | "purple" | "blue" }> = { customer: { label: "Customer", tone: "gray" }, ai: { label: "AI", tone: "purple" }, business_app: { label: "You (app)", tone: "green" }, admin: { label: "You (panel)", tone: "blue" } };

async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? "Request failed");
  return j as T;
}

export function WhatsappPanel({ meta }: { meta: { appId?: string; configId?: string; graphVersion: string } }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [greeting, setGreeting] = useState("");
  const [handoff, setHandoff] = useState(720);

  const refresh = useCallback(async () => {
    const s = await api<{ account: Account | null }>("/api/v1/admin/whatsapp/status");
    setAccount(s.account); setGreeting(s.account?.greeting ?? ""); setHandoff(s.account?.handoffMinutes ?? 720);
    if (s.account) setConvs((await api<{ conversations: Conv[] }>("/api/v1/admin/whatsapp/conversations")).conversations);
  }, []);
  useEffect(() => { refresh().catch((e) => setError(e.message)); }, [refresh]);

  async function openConv(id: string) { setOpen(id); setMsgs((await api<{ messages: Msg[] }>(`/api/v1/admin/whatsapp/conversations/${id}`)).messages); }
  const guarded = (fn: () => Promise<unknown>) => fn().catch((e: Error) => setError(e.message));

  const active = account?.status === "connected";
  return (
    <div className="space-y-6">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      <Card>
        <CardHeader title="WhatsApp connection" subtitle="Coexistence: your number works in the WhatsApp Business app and with AI at the same time."
          action={account && <Badge tone={active ? "green" : "gray"}>{active ? "Connected" : account.status}</Badge>} />
        <div className="space-y-4 p-5">
          {active ? (
            <>
              <p className="text-sm">Number: <b>{account!.displayPhone ?? "connected"}</b> · mode: {account!.mode}</p>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={account!.aiEnabled} onChange={(e) => guarded(async () => { await api("/api/v1/admin/whatsapp/settings", "PATCH", { aiEnabled: e.target.checked }); await refresh(); })} />AI replies enabled</label>
              <Field label="AI greeting (optional)"><Textarea rows={2} value={greeting} onChange={(e) => setGreeting(e.target.value)} placeholder="Hi! Welcome to our print shop 👋 What can we print for you?" /></Field>
              <Field label="Pause AI after you reply (minutes)"><Input type="number" min={1} value={handoff} onChange={(e) => setHandoff(Number(e.target.value))} className="max-w-40" /></Field>
              <div className="flex gap-2">
                <Button onClick={() => guarded(async () => { await api("/api/v1/admin/whatsapp/settings", "PATCH", { greeting, handoffMinutes: handoff }); await refresh(); })}>Save settings</Button>
                <Button variant="danger" onClick={() => confirm("Disconnect WhatsApp?") && guarded(async () => { await api("/api/v1/admin/whatsapp/connect", "DELETE"); await refresh(); })}>Disconnect</Button>
              </div>
            </>
          ) : meta.appId && meta.configId ? (
            <WhatsappConnect appId={meta.appId} configId={meta.configId} graphVersion={meta.graphVersion} onConnected={() => guarded(refresh)} />
          ) : (
            <p className="text-sm text-amber-700">Meta app not configured on this server (META_APP_ID, META_EMBEDDED_SIGNUP_CONFIG_ID). See docs/WHATSAPP.md.</p>
          )}
        </div>
      </Card>

      {active && (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Card>
            <CardHeader title="Conversations" />
            {convs.length === 0 ? <EmptyState title="No chats yet" /> : (
              <ul className="divide-y divide-slate-100">
                {convs.map((c) => (
                  <li key={c.id}><button onClick={() => guarded(() => openConv(c.id))} className={`w-full px-4 py-3 text-left text-sm hover:bg-slate-50 ${open === c.id ? "bg-slate-50" : ""}`}>
                    <p className="font-medium">{c.customerName ?? c.customerWaId}</p>
                    <p className="text-xs text-slate-500">{new Date(c.lastMessageAt).toLocaleString("en-AE")}{c.aiPausedUntil && new Date(c.aiPausedUntil) > new Date() ? " · AI paused" : ""}</p>
                  </button></li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Thread" action={open && <Button variant="secondary" onClick={() => guarded(async () => { await api(`/api/v1/admin/whatsapp/conversations/${open}`, "PATCH", { resumeAi: true }); await refresh(); })}>Resume AI</Button>} />
            {!open ? <EmptyState title="Select a conversation" /> : (
              <div className="space-y-3 p-4">
                <div className="max-h-96 space-y-2 overflow-y-auto" data-testid="wa-thread">
                  {msgs.map((m) => (
                    <div key={m.id} className={`flex ${m.direction === "in" ? "justify-start" : "justify-end"}`}>
                      <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${m.direction === "in" ? "bg-slate-100" : "bg-emerald-50"}`}>
                        <div className="mb-1"><Badge tone={SRC[m.source]?.tone ?? "gray"}>{SRC[m.source]?.label ?? m.source}</Badge></div>
                        <p className="whitespace-pre-wrap">{m.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!reply.trim()) return; guarded(async () => { await api("/api/v1/admin/whatsapp/messages", "POST", { conversationId: open, text: reply }); setReply(""); await openConv(open); }); }}>
                  <Input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply as the shop (pauses the AI)" />
                  <Button>Send</Button>
                </form>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
