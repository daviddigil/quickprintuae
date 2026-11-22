# WhatsApp ordering with AI replies (Coexistence) — status: COMING SOON

The full stack is built and tested offline, but **shipped disabled**. With `WHATSAPP_ENABLED` unset, shop owners see a
"Coming soon" page at `/admin/whatsapp`, every `/api/v1/admin/whatsapp/*` route returns `503 {"error":"WhatsApp ordering is coming soon"}`,
and the webhook returns 404 (GET) / 503 (POST) and does nothing. Set `WHATSAPP_ENABLED=1` to turn it on.

> **Not yet verified against real Meta.** The build sandbox cannot reach Meta. Everything below that touches Graph API payloads,
> Embedded Signup and coexistence behaviour is written from Meta's public documentation and must be tested with a real app.
> Items marked **(verify in Meta docs)** are ones I am not certain about.

## How it works

```
Customer ──WhatsApp──► Meta Cloud API ──webhook──► POST /api/webhooks/whatsapp
                                                     │ verify X-Hub-Signature-256 (raw body, HMAC-SHA256, timing-safe)
                                                     │ parse → ack 200 immediately → process in after()
                                                     ▼
  messages           → store (dedupe on wamid) → AI active? → Claude agent (tools) → Graph send → store reply
  smb_message_echoes → owner replied from the WhatsApp Business app → store as "business_app" + PAUSE AI (handoff window)
  statuses           → update delivery/read status
```

- **Coexistence** = the shop's existing WhatsApp Business *app* number is also registered on the Cloud API, so the owner keeps using the
  phone app while AI answers through the API. When the owner types a reply on the phone, Meta sends it to us as an echo and we pause
  the AI for that chat (`handoffMinutes`, default 12 h). The owner can also "Resume AI" or reply from the admin panel (which pauses AI too).
- **AI agent** (`src/server/whatsapp/agent.ts`): Claude `claude-opus-5-5`, effort low, manual tool loop (max 6 turns) with server-side refusal fallbacks.
  Tools, all scoped to the shop: `list_products`, `quote_price` (uses `computeLinePrice` — the same engine as checkout, so the model never invents prices),
  `send_checkout_link` (storefront URL with the `?cfg=` prefill), `shop_info`, `handoff_to_human`.
  Rules in the system prompt: concise replies, mirror English/Arabic, AED + VAT clarity, online payment only (no COD), never take payment/ID details in chat.
- **No key?** Without `ANTHROPIC_API_KEY` a deterministic rule-based replier handles greetings, product menu, "500 business cards" quotes + link, delivery/hours, and "talk to a human".
- **Orders still happen on the storefront:** files, pickup/delivery slot and payment (Stripe / Mamo Pay) are on the checkout link, never in chat.
- **Limits:** 20 AI replies / 10 min / conversation; last 12 messages are used as context.

## Meta setup (per platform, one time)

1. Create a Meta app (type *Business*) at developers.facebook.com and add the **WhatsApp** product. Complete **Business verification**.
2. Become a **Tech Provider** (needed for Embedded Signup for other businesses) and request **Advanced Access** via App Review for
   `whatsapp_business_management` and `whatsapp_business_messaging` **(verify in Meta docs)**.
3. Create an **Embedded Signup** configuration (Facebook Login for Business → Configurations) for WhatsApp with **coexistence / WhatsApp Business app onboarding** enabled. Copy the *configuration ID*.
4. Webhooks → WhatsApp Business Account → callback URL `https://YOUR_DOMAIN/api/webhooks/whatsapp`, verify token = `META_VERIFY_TOKEN`.
   Subscribe to fields: `messages` and **`smb_message_echoes`** (also consider `smb_app_state_sync` and `history` — not handled yet).
5. Add your domain to the app's allowed domains / JS SDK origins.
6. Set env vars, then `WHATSAPP_ENABLED=1`.

| Env | Purpose |
|---|---|
| `WHATSAPP_ENABLED` | `1`/`true` turns the feature on (default off = Coming soon) |
| `WHATSAPP_FAKE` | `1` logs outbound messages to the DB only and skips Meta calls (testing) |
| `META_APP_ID`, `META_APP_SECRET` | Meta app credentials (secret signs webhook verification + code exchange) |
| `META_VERIFY_TOKEN` | any random string; must match the webhook config |
| `META_EMBEDDED_SIGNUP_CONFIG_ID` | Embedded Signup configuration ID |
| `META_GRAPH_VERSION` | default `v21.0` |
| `ANTHROPIC_API_KEY` | enables the Claude agent (otherwise rule-based replies) |
| `ENCRYPTION_KEY` | encrypts each shop's access token at rest (AES-256-GCM) |

## Shop onboarding flow
Admin → WhatsApp → **Connect WhatsApp Business** → Facebook popup (Embedded Signup, `featureType: whatsapp_business_app_onboarding`)
→ browser receives `WA_EMBEDDED_SIGNUP` (waba_id, phone_number_id) and an auth `code` → `POST /api/v1/admin/whatsapp/connect`
exchanges the code, subscribes our app to the WABA (`POST /{waba}/subscribed_apps`), stores the encrypted token, and the number is live.

## Constraints to confirm with Meta **(verify in Meta docs)**
- Coexistence requirements: recent WhatsApp Business **app** version, the number must have been actively used on the app, business must be in a supported country (check UAE availability), and onboarding is done by scanning a QR code / confirming on the phone.
- Coexistence limits some app features (e.g. disappearing messages, view-once, live location) and has its own throughput limit.
- Chat history sync (`history` webhook) and contact/state sync (`smb_app_state_sync`) are optional and not implemented.
- The exact echo payload shape for `smb_message_echoes` (`message_echoes[]` vs `messages[]`) — the parser accepts both.
- 24-hour **customer-service window**: free-form replies only within 24 h of the customer's last message (enforced in `graph.ts`); outside it a pre-approved **template** is required.

## TODO before launch
- [ ] Test with a real Meta app + a real coexistence number (payload shapes, echo field, subscribe call).
- [ ] Template messages (order confirmation, "ready for pickup", delivery updates) for outside the 24 h window; opt-in handling.
- [ ] Inbound media (customers sending photos/PDFs): download via media API and attach to a draft order, or keep redirecting to the link.
- [ ] Send order status updates from `setOrderStatus` over WhatsApp.
- [ ] Interactive buttons / list messages in the agent (`sendInteractiveButtons` exists but is not used by the agent yet).
- [ ] Token refresh / error handling when Meta revokes access (`status = 'error'`); webhook retry observability.
- [ ] Arabic QA of agent replies; per-plan gating (e.g. Growth+).
- [ ] Privacy notice: chats are stored in `whatsapp_messages`; add retention policy (PDPL).

## Files
`src/server/whatsapp/{signature,parse,graph,graph-window,tools,agent,fallback,process,guard}.ts`,
`src/app/api/webhooks/whatsapp/route.ts`, `src/app/api/v1/admin/whatsapp/**`, `src/app/admin/whatsapp/page.tsx`,
`src/components/admin/Whatsapp{ComingSoon,Connect,Panel}.tsx`, `src/lib/whatsapp-flag.ts`, tables `whatsapp_accounts|conversations|messages`.
Tests: `npx tsx --tsconfig tsconfig.json --test src/server/whatsapp/whatsapp.test.ts`.
