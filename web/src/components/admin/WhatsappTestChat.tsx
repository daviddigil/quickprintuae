"use client";
import { useRef, useState } from "react";
import { Bot, Send } from "lucide-react";
import { Badge, Button, Card, CardHeader, Input } from "@/components/ui";

interface Turn { role: "user" | "assistant"; content: string }
interface Btn { id: string; title: string }

/** Try the AI exactly as a customer would. Runs the real agent with this shop's data; nothing is sent to WhatsApp or stored. */
export function WhatsappTestChat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [cart, setCart] = useState<unknown[]>([]);
  const [buttons, setButtons] = useState<Btn[]>([]);
  const [engine, setEngine] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  async function send(content: string, buttonId?: string) {
    if (!content.trim() || busy) return;
    const next: Turn[] = [...turns, { role: "user", content }];
    setTurns(next); setText(""); setBusy(true); setErr(null); setButtons([]);
    try {
      const res = await fetch("/api/v1/admin/whatsapp/test-chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: next.slice(-20), cart, buttonId }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Test chat failed");
      setTurns([...next, { role: "assistant", content: j.reply }]); setCart(j.cart ?? []); setButtons(j.buttons ?? []); setEngine(j.engine);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  return (
    <Card data-testid="wa-test-chat">
      <CardHeader title={<span className="flex items-center gap-2"><Bot className="h-4 w-4" />Try the AI (test chat)</span>} subtitle="Type like a customer, e.g. “500 business cards and 100 flyers”. Nothing is sent to WhatsApp."
        action={engine && <Badge tone={engine === "claude" ? "purple" : "gray"}>{engine === "claude" ? "Claude" : "Rule-based"}</Badge>} />
      <div className="space-y-3 p-4">
        <div className="max-h-80 min-h-24 space-y-2 overflow-y-auto rounded-lg bg-surface-low p-3" data-testid="wa-test-log">
          {turns.length === 0 && <p className="text-sm text-on-surface-variant">Say “hi” to start.</p>}
          {turns.map((t, i) => (
            <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${t.role === "user" ? "bg-success-container" : "bg-white shadow-sm"}`} data-role={t.role}>{t.content}</div>
            </div>
          ))}
          {busy && <p className="text-xs text-outline">AI is typing…</p>}
          <div ref={endRef} />
        </div>
        {buttons.length > 0 && <div className="flex flex-wrap gap-2" data-testid="wa-test-buttons">{buttons.map((b) => <Button key={b.id} variant="secondary" onClick={() => send(b.title, b.id)}>{b.title}</Button>)}</div>}
        {err && <p className="text-sm text-critical">{err}</p>}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message as a customer…" maxLength={1500} data-testid="wa-test-input" />
          <Button disabled={busy || !text.trim()} data-testid="wa-test-send"><Send className="h-4 w-4" />Send</Button>
        </form>
        {turns.length > 0 && <button type="button" className="text-xs text-on-surface-variant underline" onClick={() => { setTurns([]); setCart([]); setButtons([]); setEngine(null); }}>Start over</button>}
      </div>
    </Card>
  );
}
