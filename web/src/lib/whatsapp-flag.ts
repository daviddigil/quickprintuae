import { fakeFlag as runtimeFake } from "@/lib/runtime";
/** WhatsApp ordering is LIVE by default. Set WHATSAPP_ENABLED=0 (or false/off/no) to switch the whole feature off. */
export const whatsappEnabled = () => !["0", "false", "off", "no"].includes((process.env.WHATSAPP_ENABLED ?? "").trim().toLowerCase());
/** Testing aid: record outbound messages in the DB only and never call Meta. Never enable in production. */
export const whatsappFake = () => runtimeFake("WHATSAPP_FAKE");

/** Read at call time (not import time) so tests / mocks can point the Graph API elsewhere. */
export function metaConfig() {
  const e = process.env;
  return {
    appId: e.META_APP_ID || undefined,
    appSecret: e.META_APP_SECRET || undefined,
    verifyToken: e.META_VERIFY_TOKEN || undefined,
    signupConfigId: e.META_EMBEDDED_SIGNUP_CONFIG_ID || undefined,
    graphVersion: e.META_GRAPH_VERSION || "v21.0",
    graphBase: (e.META_GRAPH_BASE || "https://graph.facebook.com").replace(/\/$/, ""),
  };
}

/** Platform-level Meta app (needed for Embedded Signup + the shared webhook). Shops can still connect with their own app (manual connect). */
export const platformConfigured = () => { const m = metaConfig(); return !!(m.appId && m.appSecret && m.verifyToken); };
export const embeddedSignupReady = () => { const m = metaConfig(); return platformConfigured() && !!m.signupConfigId; };

/** "claude" when an Anthropic key is set, else the deterministic rule-based replier. */
export const aiMode = () => (process.env.ANTHROPIC_API_KEY ? "claude" : "rule-based") as "claude" | "rule-based";

/** Webhook fields to subscribe in the Meta dashboard (smb_message_echoes = owner replies from the WhatsApp Business app, needed for coexistence). */
export const WA_SUBSCRIBE_FIELDS = ["messages", "smb_message_echoes"];
