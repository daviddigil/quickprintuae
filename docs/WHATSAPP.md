# WhatsApp ordering with AI replies (Coexistence + chat cart) — status: LIVE

The feature is **on by default** (`WHATSAPP_ENABLED=0` switches the whole thing off). Shop owners find it under **Admin → WhatsApp**.
It works end to end against local mocks of Meta and Anthropic (see "Verified"). To use it with **real customers** you still need a
verified Meta app and a WhatsApp Business number — see the **Go-live checklist**. Until then owners can already try the AI in the **Test chat**.

> **Honesty box.** This sandbox cannot reach Meta or Anthropic. Everything that touches real Meta payloads, Embedded Signup,
> coexistence availability and the real Claude API was written from public documentation and verified only against the mocks in `web/e2e/`.
> Items marked **(verify in Meta docs)** are ones I am not certain about.

## What customers and owners get

```
Customer ──WhatsApp──► Meta Cloud API ──signed webhook──► POST /api/webhooks/whatsapp
   ▲                                                         │ verify X-Hub-Signature-256 over the RAW body (timing-safe)
   │                                                         │ parse → ack 200 immediately → process in after()
   │                                                         ▼
   │   messages          → dedupe on wamid → AI active? → agent (Claude, or rule-based) → Graph send → stored
   │   smb_message_echoes→ owner replied from the WhatsApp Business app → stored as "You (app)" + PAUSE AI
   └── reply ◄── Graph API ◄── statuses (sent/delivered/read) update the stored messages
```

- **Coexistence** = the shop's existing WhatsApp Business *app* number is also registered on the Cloud API. The owner keeps using the phone app;
  when they type a reply there, Meta sends it to us as an echo and the AI pauses on that chat (`handoffMinutes`, default 12 h). **Resume AI** or any reply from the admin panel also controls this.
- **Chat cart ("chatcartpro" idea).** The conversation has a cart. The customer says *"500 business cards and 100 flyers"* → items are added (priced by
  the **same engine as checkout**), the customer gets the cart plus buttons **[Confirm cart] [Change something] [Talk to a human]**, and on *Confirm* (or "checkout")
  receives **one message**: itemised lines with AED prices, subtotal, VAT 5 %, total estimate and **one prefilled storefront link per line** (`?cfg=` carries quantity + options).
  Files, pickup/delivery slot and online payment (Stripe) happen on those links — never in chat. No cash on delivery.
- **AI tools** (all scoped to the shop): `list_products`, `quote_price`, `add_to_cart`, `view_cart`, `remove_from_cart`, `clear_cart`, `send_checkout_links`, `shop_info`, `handoff_to_human`.
  Arguments are validated with zod; prices come only from `computeLinePrice`, so the model can't invent or discount.
- **No Anthropic key?** A deterministic rule-based assistant handles greetings, menu, quotes, multi-item add, cart, checkout, remove, clear, human. With a key, `claude-opus-5-5` (effort low, tool loop ≤ 8 turns, server-side refusal fallbacks) answers.

## Admin screens (Admin → WhatsApp)
1. **One big green "Connect WhatsApp" button** (owner only; also a small card on the dashboard). Three states:
   - **Platform ready** → Meta **Embedded Signup** popup (coexistence, `featureType: whatsapp_business_app_onboarding`) using the *platform's* Tech Provider app → "Connected: +971…" welcome screen with a **Send a test message to my phone** action (`hello_world` template; the shop's own number is refused).
   - **Platform not ready** → a friendly **"Activation pending"** sheet: *Notify me* (idempotent, one row per shop, shown to the superadmin as a waiting list), *Manual connect (your own Meta app)* and *Try your AI assistant* (test chat). No env jargon, no "coming soon".
   - **Connected** → the connection card (number, method, masked token, last webhook, AI on/off, greeting, hand-off minutes, **Disconnect** wipes secrets, history kept).
2. **Setup status** — plain-language "At a glance".
3. **Manual connect** (advanced) — WABA ID, Phone Number ID, System User token, app secret; verified against Graph, stored **encrypted**; generates a verify token + shows the webhook URL. Works even with no platform app.
4. **Test chat** — type as a customer; nothing is sent or stored; 30 messages / 10 min per shop.
5. **Conversations** — source badges, cart, **Needs you** flag, manual reply, **Resume AI**.
Messages are billed at the platform rate card (Admin → Billing shows pay-as-you-go usage).

## Superadmin: Tech Provider credentials (Superadmin → Settings → WhatsApp Tech Provider)
Paste **App ID, App Secret, Embedded Signup Config ID, webhook verify token** (Generate button), optional Graph version. **Test credentials** calls Graph with the app token (`GET /{appId}?fields=id,name`). Secrets are write-only (never returned; masked hint only), encrypted at rest, every save/remove is audit-logged, and the change is live for owners immediately (config cache invalidated; other instances within 10 s) — **no restart, no env edit**. The page also shows a readiness checklist, the webhook URL + fields to paste into Meta, and the shops waiting for activation. Unset = shown as "not configured"; the owner button then shows the activation sheet.
**Source order: database first, `META_*` env as fallback** (`getMetaPlatformConfig()` in `src/server/whatsapp/platform-config.ts`).

## Security & reliability
- Webhook signature is checked over the **raw body** with HMAC-SHA256 (timing-safe) **before anything is processed**. Accepted secrets: the platform app secret, or — for manual-connect shops — that shop's own app secret, **and then only for that shop's phone numbers** (a shop's secret can't authorise another shop's events). No secret configured and nothing matches → `503 {"error":"WhatsApp is not configured on this platform"}`; wrong secret → `401`.
- GET handshake accepts `META_VERIFY_TOKEN` or a shop's generated verify token.
- Duplicate deliveries (Meta retries) are ignored by `wamid` (unique index). Acknowledge-then-process (`after()`), so Meta never times out waiting for the AI.
- **24-hour customer-service window:** free-form messages only within 24 h of the customer's last message. Outside it the message is **not sent**, is stored with status `skipped` (reason `outside_service_window`) and the admin gets a clear error. (Template messages are not implemented — see TODO.)
- Per-conversation limit: ≤ 20 AI replies / 10 min. Tenant isolation on every conversation/message id (another shop gets 404).
- Customer text is untrusted data: control/zero-width characters stripped, length capped, the system prompt tells the model to ignore instructions inside customer messages, and every tool argument is validated server-side (bad slug, negative quantity, unknown option → rejected, cart unchanged).
- If Anthropic is down/overloaded/refuses/loops, the customer gets a polite message, the chat is flagged **Needs you** and an audit-log entry (`whatsapp.needs_human`) is written; the AI tries again on the customer's next message. Send failures (e.g. revoked token) also flag the chat.
- Tokens and app secrets are AES-256-GCM encrypted with `ENCRYPTION_KEY`; APIs return only a masked suffix.

## Go-live checklist (what you must do once you have the Tech Provider)
1. Meta app (type *Business*) with the **WhatsApp** product; **Business verification** complete; become a **Tech Provider** and get **Advanced Access** (App Review) for `whatsapp_business_management` + `whatsapp_business_messaging` **(verify in Meta docs)**.
2. Create an **Embedded Signup** configuration (Facebook Login for Business → Configurations) with **coexistence / WhatsApp Business app onboarding** **(verify in Meta docs)**; note the Configuration ID. Add your domain to allowed domains / JS SDK origins.
3. Meta → Webhooks → *WhatsApp Business Account*: callback `https://YOUR_DOMAIN/api/webhooks/whatsapp`, verify token = the one shown on the superadmin page; subscribe **`messages`** and **`smb_message_echoes`**.
4. Superadmin → Settings → **WhatsApp Tech Provider**: paste App ID, App Secret, Config ID, verify token → **Test credentials** → **Save**. Owners' button goes live instantly. Optionally message the shops on the waiting list.
5. Set `ANTHROPIC_API_KEY` for full AI (else the rule-based assistant answers).
6. Test with one real number first; confirm the echo behaviour (owner reply from the phone pauses the AI).
Shops with their own Meta app can always use **Manual connect**.

| Env | Purpose |
|---|---|
| `WHATSAPP_ENABLED` | default on; `0`/`false`/`off`/`no` switches the feature off |
| `WHATSAPP_FAKE` | `1` records outbound messages in the DB only and never calls Meta (demos) |
| `META_APP_ID`, `META_APP_SECRET` | **optional fallback** for the superadmin-saved platform Meta app |
| `META_VERIFY_TOKEN` | any random string; must match the webhook config |
| `META_EMBEDDED_SIGNUP_CONFIG_ID` | Embedded Signup configuration id |
| `META_GRAPH_VERSION` | default `v21.0` |
| `META_GRAPH_BASE` | default `https://graph.facebook.com` — point at a mock in tests |
| `ANTHROPIC_API_KEY` (`ANTHROPIC_BASE_URL`) | enables the Claude agent (otherwise rule-based); base URL only for mocks/proxies |
| `ENCRYPTION_KEY` | encrypts tokens / app secrets at rest |

## Verified vs NOT verified
**Verified automatically (against local mocks)** — `web/e2e/whatsapp-live.mjs`, 52 checks, plus the unit/DB tests (`npm test`):
Superadmin screen (access control 401/403, validation, Test credentials vs mock Graph, encrypted write-only secrets, audit, remove); the owner button flips pending → ready with **no restart**; activation sheet + idempotent *Notify me*; one-click flow with a **stubbed** `FB.login` + `WA_EMBEDDED_SIGNUP` message; test message; DB-over-env precedence and env fallback; 390 px layout. Earlier checks:
Setup status API+UI (configured / not configured); Embedded-Signup code exchange and Manual connect incl. Graph rejection, encrypted storage, never echoing secrets; webhook GET handshake; signed inbound → AI reply via Graph with the decrypted token to the right customer; `500 business cards` = AED 126.00 (independent re-computation of the pricing engine from the DB); multi-item chat cart with options → one itemised message with correct subtotal/VAT/total and working prefilled links (product page opens with the options preselected); interactive button replies (Confirm / Talk to a human); bad/missing/tampered signature → 401 and nothing stored; replayed `wamid` → one reply; status webhooks; coexistence echo pauses the AI and Resume works; admin manual reply via Graph; 24 h window refusal logged as `skipped`; Anthropic overloaded/refusal → polite message + **Needs you** + audit; prompt-injection-style tool abuse rejected; 20-replies/10-min limit; cross-shop isolation (404); per-shop app secret can't authorise another shop's number; disconnect wipes secrets; test chat works with no Meta at all (and is rate-limited).

**NOT verified — needs a real account:**
- Real Meta payloads/behaviour: Embedded Signup popup + `WA_EMBEDDED_SIGNUP` message, coexistence onboarding, the exact `smb_message_echoes` shape (the parser accepts `message_echoes[]` and `messages[]`), webhook retries, rate limits. The Facebook JS SDK popup itself is stubbed in tests, never run against Facebook; the Tech Provider credentials screen has only been run against the mock Graph.
- **Coexistence availability / requirements for UAE numbers (verify in Meta docs):** recent WhatsApp Business app version, number actively used on the app, supported countries, and which app features are limited while coexisting.
- The real Claude API (request/response shapes follow the SDK; the mock mirrors them), real latency, and answer quality in Arabic.
- Business verification, Tech Provider status and App Review outcomes.

## Run the tests
```bash
cd web
# 1) mocks
node e2e/mock-meta.mjs &          # Graph API mock + signed-webhook helpers, port 4999
node e2e/mock-anthropic.mjs &     # Messages API mock for the real agent loop, port 4998
# 2) three app instances (own dist dirs; never the default .next)
export META_GRAPH_BASE=http://localhost:4999
NEXT_DIST_DIR=.next-wa-a npx next dev -p 3123 &   # A: NO META env (credentials come from the DB), rule-based AI
NEXT_DIST_DIR=.next-wa-b ANTHROPIC_API_KEY=sk-ant-mock ANTHROPIC_BASE_URL=http://localhost:4998 npx next dev -p 3124 &   # B: Claude (mock)
NEXT_DIST_DIR=.next-wa-c META_APP_ID=9990001 META_APP_SECRET=envsecret-fallback-123 META_VERIFY_TOKEN=envverify-token-123 META_EMBEDDED_SIGNUP_CONFIG_ID=9990002 npx next dev -p 3125 &   # C: env fallback
# 3) Postgres up + seeded (demo shop), then:
node e2e/whatsapp-live.mjs        # prints ✔ per check, exits non-zero on failure
```
Needs the demo shop (`owner@demo.ae`) and the standard dev database. The script creates and removes its own test numbers (`7100000000xx`) and a throw-away second shop.
Signup (5/hour) and the test-message limiter (5/10 min) are per server process — restart instance A between repeated runs. The script creates and removes its own throw-away superadmin, so it never needs the real admin password.

## TODO before / after launch
- [ ] Test with a real Meta app + a real coexistence number (payload shapes, echo field, subscribe call, UAE availability).
- [ ] Template messages (order confirmation, "ready for pickup", delivery updates) for outside the 24 h window, and opt-in handling.
- [ ] Inbound media (customers sending photos/PDFs): download via the media API and attach to a draft order, or keep redirecting to the link.
- [ ] Order status updates over WhatsApp from `setOrderStatus`.
- [ ] Optional history/contact sync (`history`, `smb_app_state_sync` webhooks are not handled).
- [ ] Token-expiry/revocation monitoring (a failed send flags the chat as *Needs you*; there is no proactive alert email yet — the shop has no email infrastructure).
- [ ] Arabic QA of agent replies; per-plan gating if desired (currently available to every shop).
- [ ] Privacy notice and retention policy for stored chats (PDPL).
- [ ] Rate limiter and test-chat limiter are in-memory per process; use a shared store when running several instances.

## Files
`src/server/whatsapp/`: `signature`, `parse`, `graph`, `graph-window`, `webhook-auth`, `tools`, `cart-math` (pure), `cart`, `buttons`, `agent`, `fallback`, `process`, `guard` (+ `whatsapp.test.ts`, `cart.test.ts`).
`src/app/api/webhooks/whatsapp/route.ts`; `src/app/api/v1/admin/whatsapp/{status,connect,connect/manual,settings,conversations,messages,test-chat}`;
`src/app/admin/whatsapp/page.tsx`; `src/components/admin/Whatsapp{Panel,ConnectHero,ActivationSheet,Welcome,DashboardCard,SetupStatus,ManualConnect,TestChat}.tsx`; `src/components/platform/superadmin/MetaTechProviderForm.tsx`; `src/app/superadmin/settings/whatsapp/page.tsx`; `src/app/api/v1/superadmin/whatsapp/{route,test,requests}`; `src/server/whatsapp/{platform-config,superadmin-guard}.ts`; `src/lib/whatsapp-flag.ts`.
Tables: `whatsapp_accounts` (+ `connection_method`, `app_secret_enc`, `verify_token`, `last_webhook_at`), `whatsapp_conversations` (+ `cart`, `needs_human`, `needs_human_reason`), `whatsapp_messages` — migrations `0005`, `0008` (`platform_gateways.config`, `whatsapp_activation_requests`).
Tests: `e2e/mock-meta.mjs`, `e2e/mock-anthropic.mjs`, `e2e/whatsapp-live.mjs`.
