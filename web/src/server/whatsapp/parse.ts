/** Pure parsing of Meta webhook payloads into normalized events (no DB, easy to test). */
export type WaEvent =
  | { kind: "inbound"; phoneNumberId: string; from: string; name?: string; wamid: string; type: string; text: string; /** id of the interactive reply button / list row the customer tapped */ buttonId?: string; timestamp: number; raw: unknown }
  | { kind: "echo"; phoneNumberId: string; to: string; wamid: string; type: string; text: string; timestamp: number; raw: unknown }
  | { kind: "status"; phoneNumberId: string; wamid: string; status: string; timestamp: number };

interface Msg { id: string; from?: string; to?: string; timestamp?: string; type?: string; text?: { body?: string }; interactive?: { button_reply?: { title?: string; id?: string }; list_reply?: { title?: string; id?: string } }; image?: { caption?: string }; document?: { caption?: string; filename?: string }; button?: { text?: string } }

function bodyOf(m: Msg): string {
  switch (m.type) {
    case "text": return m.text?.body ?? "";
    case "interactive": return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "";
    case "button": return m.button?.text ?? "";
    case "image": return m.image?.caption ? `[image] ${m.image.caption}` : "[image]";
    case "document": return `[document${m.document?.filename ? `: ${m.document.filename}` : ""}]${m.document?.caption ? ` ${m.document.caption}` : ""}`;
    default: return `[${m.type ?? "unsupported"}]`;
  }
}

export function parseWebhook(payload: unknown): WaEvent[] {
  const out: WaEvent[] = [];
  const p = payload as { object?: string; entry?: { changes?: { field?: string; value?: Record<string, unknown> }[] }[] };
  if (p?.object !== "whatsapp_business_account") return out;
  for (const entry of p.entry ?? []) for (const ch of entry.changes ?? []) {
    const v = ch.value as { metadata?: { phone_number_id?: string }; contacts?: { wa_id: string; profile?: { name?: string } }[]; messages?: Msg[]; message_echoes?: Msg[]; statuses?: { id: string; status: string; timestamp?: string }[] } | undefined;
    const phoneNumberId = v?.metadata?.phone_number_id;
    if (!v || !phoneNumberId) continue;
    if (ch.field === "messages") {
      for (const m of v.messages ?? []) {
        if (!m.id || !m.from) continue;
        const buttonId = m.interactive?.button_reply?.id ?? m.interactive?.list_reply?.id;
        out.push({ kind: "inbound", phoneNumberId, from: m.from, name: v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name, wamid: m.id, type: m.type ?? "text", text: bodyOf(m), ...(buttonId ? { buttonId } : {}), timestamp: Number(m.timestamp) || Math.floor(Date.now() / 1000), raw: m });
      }
      for (const st of v.statuses ?? []) out.push({ kind: "status", phoneNumberId, wamid: st.id, status: st.status, timestamp: Number(st.timestamp) || 0 });
    }
    // Coexistence: messages the owner sends from the WhatsApp Business app arrive as smb_message_echoes
    if (ch.field === "smb_message_echoes") {
      for (const m of v.message_echoes ?? v.messages ?? []) {
        if (!m.id || !m.to) continue;
        out.push({ kind: "echo", phoneNumberId, to: m.to, wamid: m.id, type: m.type ?? "text", text: bodyOf(m), timestamp: Number(m.timestamp) || Math.floor(Date.now() / 1000), raw: m });
      }
    }
  }
  return out;
}
