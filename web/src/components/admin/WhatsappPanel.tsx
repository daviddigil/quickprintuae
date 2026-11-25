"use client";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Textarea } from "@/components/ui";
import { WhatsappConnectHero } from "./WhatsappConnectHero";
import { WhatsappWelcome } from "./WhatsappWelcome";
import { WhatsappSetupStatus, type SetupStatus } from "./WhatsappSetupStatus";
import { WhatsappTestChat } from "./WhatsappTestChat";

interface Account { displayPhone: string | null; status: string; mode: string; connectionMethod: string; aiEnabled: boolean; greeting: string; handoffMinutes: number; lastWebhookAt: string | null; tokenMask: string | null; verifyToken: string | null }
interface CartItem { name: string; quantity: number; subtotalAed: number }
interface Conv { id: string; customerWaId: string; customerName: string | null; lastMessageAt: string; aiPausedUntil: string | null; needsHuman: boolean; needsHumanReason: string | null; cart: CartItem[] }
interface Msg { id: string; direction: string; source: string; body: string; status: string | null; createdAt: string }
const SRC: Record<string, { label: string; tone: "gray" | "green" | "purple" | "blue" }> = { customer: { label: "Customer", tone: "gray" }, ai: { label: "AI", tone: "purple" }, business_app: { label: "You (app)", tone: "green" }, admin: { label: "You (panel)", tone: "blue" } };
const REASON: Record<string, string> = { ai_error: "AI was unavailable", ai_refusal: "AI declined a request", ai_loop: "AI couldn't finish", ai_empty: "AI gave no answer", handoff: "Customer asked for a person", send_failed: "A reply could not be sent" };

async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? "Request failed");
  return j as T;
}

export function WhatsappPanel({ isOwner }: { isOwner: boolean }) {
  const [status, setStatus] = useState<(SetupStatus & { account: Account | null }) | null>(null);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [openConvData, setOpenConvData] = useState<Conv | null>(null);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [greeting, setGreeting] = useState("");
  const [handoff, setHandoff] = useState(720);
  const [welcome, setWelcome] = useState<{ phone: string | null } | null>(null);

  const account = status?.account ?? null;
  const active = account?.status === "connected";

  const refresh = useCallback(async () => {
    const s = await api<SetupStatus & { account: Account | null }>("/api/v1/admin/whatsapp/status");
    setStatus(s); setGreeting(s.account?.greeting ?? ""); setHandoff(s.account?.handoffMinutes ?? 720);
    if (s.account?.status === "connected") setConvs((await api<{ conversations: Conv[] }>("/api/v1/admin/whatsapp/conversations")).conversations);
  }, []);
  useEffect(() => { refresh().catch((e) => setError(e.message)); }, [refresh]);
  // light polling so new customer chats appear without a reload
  useEffect(() => { if (!active) return; const t = setInterval(() => { refresh().catch(() => {}); }, 8000); return () => clearInterval(t); }, [active, refresh]);

  async function openConv(id: string) {
    setOpen(id);
    const r = await api<{ messages: Msg[]; conversation: Conv }>(`/api/v1/admin/whatsapp/conversations/${id}`);
    setMsgs(r.messages); setOpenConvData(r.conversation);
  }
  const guarded = (fn: () => Promise<unknown>) => fn().catch((e: Error) => setError(e.message));
  const tryChat = () => document.getElementById("wa-test-chat")?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="space-y-6" data-testid="wa-panel">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" data-testid="wa-error">{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

      {status && !active && isOwner && (
        <WhatsappConnectHero platform={status.platform} requested={status.activationRequested}
          onConnected={(phone) => { setWelcome({ phone }); setNotice(null); guarded(refresh); }}
          onRequested={() => guarded(refresh)}
          onManualConnected={() => { setNotice("Connected. Now add the webhook in your Meta app (details below)."); guarded(refresh); }}
          onTryChat={tryChat} />
      )}
      {welcome && active && <WhatsappWelcome phone={welcome.phone ?? account?.displayPhone ?? null} onDismiss={() => setWelcome(null)} onTryChat={tryChat} />}

      {status && <WhatsappSetupStatus s={status} />}

      <Card>
        <CardHeader title="WhatsApp connection" subtitle="Coexistence: your number keeps working in the WhatsApp Business app while AI answers through the official Cloud API."
          action={account && <Badge tone={active ? "green" : "gray"}>{active ? "Connected" : account.status}</Badge>} />
        <div className="space-y-4 p-5">
          {active ? (
            <>
              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2" data-testid="wa-connected">
                <dt className="text-slate-500">Number</dt><dd className="font-medium">{account!.displayPhone ?? "connected"}</dd>
                <dt className="text-slate-500">Connected via</dt><dd>{account!.connectionMethod === "manual" ? "Your own Meta app (manual)" : "Facebook sign-in (Embedded Signup)"} · {account!.mode}</dd>
                <dt className="text-slate-500">Access token</dt><dd className="font-mono text-xs">{account!.tokenMask ?? "—"} <span className="font-sans text-slate-400">(stored encrypted, never shown)</span></dd>
                <dt className="text-slate-500">Last message from Meta</dt><dd>{account!.lastWebhookAt ? new Date(account!.lastWebhookAt).toLocaleString("en-AE") : "none yet — send your number a WhatsApp message"}</dd>
                {account!.verifyToken && <><dt className="text-slate-500">Webhook verify token</dt><dd className="break-all font-mono text-xs" data-testid="wa-verify-token">{account!.verifyToken}</dd></>}
              </dl>
              {account!.connectionMethod === "manual" && <p className="text-xs text-slate-500">In your Meta app → WhatsApp → Configuration → Webhook: callback URL <code className="rounded bg-slate-100 px-1">{status?.webhookUrl}</code>, the verify token above, then subscribe to <code>messages</code> and <code>smb_message_echoes</code>.</p>}
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={account!.aiEnabled} disabled={!isOwner} onChange={(e) => guarded(async () => { await api("/api/v1/admin/whatsapp/settings", "PATCH", { aiEnabled: e.target.checked }); await refresh(); })} />AI replies enabled</label>
              <Field label="AI greeting (optional)"><Textarea rows={2} value={greeting} disabled={!isOwner} onChange={(e) => setGreeting(e.target.value)} placeholder="Hi! Welcome to our print shop 👋 What can we print for you?" /></Field>
              <Field label="Pause AI after you reply (minutes)"><Input type="number" min={1} value={handoff} disabled={!isOwner} onChange={(e) => setHandoff(Number(e.target.value))} className="max-w-40" /></Field>
              {isOwner && (
                <div className="flex gap-2">
                  <Button onClick={() => guarded(async () => { await api("/api/v1/admin/whatsapp/settings", "PATCH", { greeting, handoffMinutes: handoff }); setNotice("Settings saved."); await refresh(); })}>Save settings</Button>
                  <Button variant="danger" data-testid="wa-disconnect" onClick={() => confirm("Disconnect WhatsApp? Stored credentials are deleted; chat history is kept.") && guarded(async () => { await api("/api/v1/admin/whatsapp/connect", "DELETE"); await refresh(); })}>Disconnect</Button>
                </div>
              )}
            </>
          ) : !isOwner ? (
            <p className="text-sm text-slate-600">Only the shop owner can connect WhatsApp.</p>
          ) : (
            <p className="text-sm text-slate-600">Not connected yet. Use the green <b>Connect WhatsApp</b> button above — it takes about a minute.</p>
          )}
        </div>
      </Card>

      <div id="wa-test-chat" className="scroll-mt-6"><WhatsappTestChat /></div>

      {active && (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Card>
            <CardHeader title="Conversations" />
            {convs.length === 0 ? <EmptyState title="No chats yet" /> : (
              <ul className="divide-y divide-slate-100" data-testid="wa-convs">
                {convs.map((c) => (
                  <li key={c.id}><button onClick={() => guarded(() => openConv(c.id))} className={`w-full px-4 py-3 text-left text-sm hover:bg-slate-50 ${open === c.id ? "bg-slate-50" : ""}`}>
                    <p className="flex items-center justify-between gap-2 font-medium"><span>{c.customerName ?? c.customerWaId}</span>{c.needsHuman && <Badge tone="red">Needs you</Badge>}</p>
                    <p className="text-xs text-slate-500">{new Date(c.lastMessageAt).toLocaleString("en-AE")}{c.aiPausedUntil && new Date(c.aiPausedUntil) > new Date() ? " · AI paused" : ""}{c.cart?.length ? ` · cart: ${c.cart.length} item${c.cart.length > 1 ? "s" : ""}` : ""}</p>
                  </button></li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Thread" action={open && <Button variant="secondary" onClick={() => guarded(async () => { await api(`/api/v1/admin/whatsapp/conversations/${open}`, "PATCH", { resumeAi: true }); await refresh(); await openConv(open); })}>Resume AI</Button>} />
            {!open ? <EmptyState title="Select a conversation" /> : (
              <div className="space-y-3 p-4">
                {openConvData?.needsHuman && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">Needs you: {REASON[openConvData.needsHumanReason ?? ""] ?? openConvData.needsHumanReason}. Reply below (pauses the AI) or tap Resume AI.</div>}
                {!!openConvData?.cart?.length && <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">Cart: {openConvData.cart.map((i) => `${i.quantity} × ${i.name}`).join(" · ")}</div>}
                <div className="max-h-96 space-y-2 overflow-y-auto" data-testid="wa-thread">
                  {msgs.map((m) => (
                    <div key={m.id} className={`flex ${m.direction === "in" ? "justify-start" : "justify-end"}`}>
                      <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${m.direction === "in" ? "bg-slate-100" : "bg-emerald-50"}`}>
                        <div className="mb-1 flex gap-1"><Badge tone={SRC[m.source]?.tone ?? "gray"}>{SRC[m.source]?.label ?? m.source}</Badge>{m.status === "skipped" && <Badge tone="yellow">Not sent: 24h window</Badge>}{m.status === "failed" && <Badge tone="red">Failed</Badge>}</div>
                        <p className="whitespace-pre-wrap">{m.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!reply.trim()) return; guarded(async () => { await api("/api/v1/admin/whatsapp/messages", "POST", { conversationId: open, text: reply }); setReply(""); await openConv(open); await refresh(); }); }}>
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
