# 7H Music Group — Vinyl Production & Brokerage

A full-stack client portal for turnkey vinyl pressing: a live quote configurator, an order and
file-upload portal, a mobile-money / card checkout flow, and an operations console that simulates
the webhook fan-out management uses to push orders to overseas pressing plants (Mobineko, Green
Lakes).

**Design language:** matte black `#121212`, neon lime `#CCFF00`, Space Grotesk / Inter / JetBrains
Mono, glass panels, scroll reveals and a pure-SVG spinning record.

---

## Stack

| Layer      | Choice                                                               |
| ---------- | -------------------------------------------------------------------- |
| Frontend   | React 18 + TypeScript + Vite, React Router 6, Tailwind CSS 3          |
| Backend    | Node 22, Express 4, Multer (disk uploads)                             |
| Pricing    | `shared/pricing.js` — one module imported by **both** client & server  |
| Storage    | JSON file store (`data/db.json`) + uploads on disk — zero setup       |
| Dev server | Single port: Vite in middleware mode behind Express (port `4173`)     |
| Deploy     | Vercel: static `dist/` + one catch-all serverless function (`api/`)    |

```
npm install
npm run dev      # http://localhost:4173  (API + UI on one port)
```

Production:

```
npm run build
npm start        # serves dist/ + /api from one Express process
```

### Environment

Copy `.env.example` if you want to override defaults locally.

| Variable          | Default     | Purpose                                        |
| ----------------- | ----------- | ---------------------------------------------- |
| `PORT`            | `4173`      | HTTP port (standalone server)                  |
| `FX_UGX_PER_USD`  | `3750`      | Indicative FX rate used on every quote         |
| `ADMIN_PASSCODE`  | built-in demo code | Access code for the operations console — set your own before sharing the link |
| `SESSION_SECRET`  | derived     | Signs stateless admin tokens — set in production |
| `MAX_UPLOAD_MB`   | `80` (`4` on Vercel) | Per-file upload cap advertised to the client |
| `DATA_DIR`        | `./data`    | JSON store location (`/tmp/7h-data` on Vercel)  |
| `UPLOAD_DIR`      | `./uploads` | Upload location (`/tmp/7h-uploads` on Vercel)   |

## Deploy to Vercel

`vercel.json` + `api/index.js` ship ready. Import the repo in Vercel, set `ADMIN_PASSCODE` and
`SESSION_SECRET`, and deploy — no build tweaks required. Full walkthrough, environment table,
platform limits (4 MB uploads, ephemeral `/tmp`) and the upgrade path to Vercel Blob + Postgres live
in **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

```bash
npx vercel link && npx vercel --prod
```

---

## What's inside

### 1. Landing experience (`/`)
- Hero: **“Press Your Sound on Vinyl. Zero Risk, Global Delivery.”** with a live quote card bound
  to the current configuration and an animated SVG record that changes size/shape for 7" singles.
- **Sample pressings** (`/#samples`): a shelf of six sleeves in the classic East African pressing idiom,
  plus every format and jacket style as a product shot — black, colour/splatter and 7" records,
  standard jacket, gatefold and printed inner — drawn from the live catalogue
  (`src/components/vinyl/VinylMockup.tsx`) so proportion, compound colour and label size match what
  the plant presses. Tapping a sample loads it into the quote.
- **Sleeve artwork** lives in `src/components/vinyl/sleeveArt.tsx`: original designs drawn in-house
  (sunburst labels, cloth-print geometry, ochre/oxide palettes), so no third-party sleeve art is
  reproduced. Replace or add designs there — one object per sleeve.
- Ticker, four-step process, pressing-partner cards, audience grid, FAQ accordion, closing CTA.

### 2. Quote configurator (`/#configurator`)
- Quantity ladder: **1** (lathe cut) · **25** (micro-run) · **50** (boutique) · **100** · **250** ·
  **500** · **1,000** (plant run)
- Format: **12" LP Standard**, **12" Colored**, **7" Single**
- Packaging: **Standard Jacket**, **Gatefold**, **Printed Inner Sleeve**
- Plant / supplier: **Mobineko** (MOQ 25), **Green Lakes Pressing** (100), **Seabass Vinyl** (50),
  **Dr. Dub** (1, lathe), **GZ Media** (250), **Deepgrooves** (100). The dropdown disables any plant
  that cannot take the current run, and changing the quantity moves the order to the cheapest plant
  that can.
- Live maths (animated): pressing + sleeve upgrade + factory setup + plant rate card → **Total
  factory cost** → **7H management fee @ 25%** → **Turnkey total** in **USD and UGX**, with the
  **50% deposit** and balance. The "move up a tier" hint is derived from the same engine.

```
unit     = format rate at that run size (falls with volume: $45/ea at 1 → $4.35/ea at 1,000)
factory  = qty × unit(format) + qty × unit(sleeve) + setup(format, qty) + plant rate adjustment
fee      = factory × 25%
total    = factory + fee
deposit  = total × 50%
```

Per-unit prices, MOQs and rate cards live in one place — `shared/pricing.js` — so the browser, the
API and the plant hand-off always quote the same numbers. `npm run test:pricing` asserts the ladder
is monotonic, that 25 units lands on $14.50/ea and a 1-of-1 on $45.00/ea, and that MOQs are enforced.

### 3. Client order & file portal (`/order`)
Four steps with validation and a sticky live summary:

1. **Client details** — artist/label, email, WhatsApp, Uganda vs. international tour-city delivery,
   address, city, country, plant preference, notes.
2. **Masters & artwork** — drag-and-drop uploads (real `POST /api/uploads`, 80 MB cap, WAV/AIFF/FLAC/
   MP3 and print-ready PDF/JPG/TIFF) *or* pasted WeTransfer/Drive links.
3. **Payment** — MTN Mobile Money, Airtel Money, International card / bank transfer, merchant
   details, and the required terms acceptance:
   *“Production initializes upon 50% deposit and proof approval.”*
4. **Review & checkout** — full recap, then `POST /api/orders`.

### 4. Instant success screen (`/order/:id`)
Generated order ID (`7H-2026-XXXX`), deposit instructions per rail, order summary, live status of
the management alerts, and the next-steps timeline.

### 5. Operations console (`/admin`, code from `ADMIN_PASSCODE`)

The code is **never displayed** — not on the login screen, not in the server log. Six wrong attempts
per IP lock the endpoint for ten minutes.
- Summary tiles: pipeline value, orders, units, deposits collected, needs action, open alerts.
- Order list with filters + detail panel: client, package, money, downloadable file links.
- Actions: **mark deposit paid**, **forward to Mobineko / Green Lakes**, change status, copy the
  plant payload.
- **Webhook alert log** — automatically fires on every order to Slack, email, WhatsApp and plant
  intake, with delivery states, retries, a manual “test alert”, and a demo reset. The console polls
  every six seconds while the tab is visible. Each channel shows `LIVE` or `SIM`, and until real
  credentials are set the console keeps an amber “alerts are simulated” banner — see
  [Notifications](#notifications).

---

## API

| Method | Route                              | Description                                     |
| ------ | ---------------------------------- | ----------------------------------------------- |
| GET    | `/api/config`                      | Catalogue, FX rate, payment rails, plants       |
| POST   | `/api/quote`                       | Authoritative server-side quote                 |
| POST   | `/api/orders`                      | Create order (+ emits webhook fan-out)          |
| GET    | `/api/orders/:id`                  | Client-facing order status + alert feed         |
| POST   | `/api/uploads`                     | Multipart audio/artwork upload                  |
| GET    | `/api/files/:id/download`          | Download a stored file                          |
| POST   | `/api/admin/login`                 | Exchange passcode for a session token           |
| GET    | `/api/admin/overview`              | Orders, events, summary, config (auth)          |
| GET    | `/api/admin/events`                | Poll the webhook log (auth)                     |
| PATCH  | `/api/admin/orders/:id`            | Update status / payment status (auth)           |
| POST   | `/api/admin/orders/:id/forward`    | Release to a pressing plant (auth)              |
| POST   | `/api/admin/orders/:id/payment`    | Mark deposit paid (auth)                        |
| POST   | `/api/admin/events/:id/retry`      | Re-queue a webhook (auth)                       |
| POST   | `/api/admin/events/test`           | Fire a test alert (auth)                        |
| POST   | `/api/admin/reset-demo`            | Restore seeded demo data (auth)                 |

Admin routes require the `X-Admin-Token` header returned by `/api/admin/login` (8-hour sliding
session, in-memory).

### Simulated webhook payload (forwarded to the plant)

```json
{
  "orderId": "7H-2026-8K2Q",
  "plantPreference": "mobineko",
  "artistOrLabel": "Naledi Sound (Label)",
  "production": { "quantity": 250, "format": "12\" Colored (12LP-CLR)", "packaging": "Gatefold (JKT-GATE)" },
  "masterAndArtwork": [{ "role": "audio", "filename": "NALEDI_master_v3.wav", "download": "/api/files/…" }],
  "commercial": { "totalUsd": 3712.5, "totalUgx": 13921875, "depositRequiredUsd": 1856.25 }
}
```

---

## Contact

Client desk: **7hmusicgroupug@gmail.com** · **+256 768 261 003** (WhatsApp) · Kampala, Uganda,
Mon–Sat 09:00–19:00 EAT. These live in `src/lib/contact.ts` (UI) and `server/config.js` (API) and can
be overridden with `CONTACT_EMAIL` / `CONTACT_PHONE` / `CONTACT_WHATSAPP` — see
[DEPLOYMENT.md](./DEPLOYMENT.md#environment-variables).

## Going to market

[`PITCH.md`](./PITCH.md) holds the first-client kit: the WhatsApp message, a 5-minute demo script,
the three objections you will hear, and the pre-pitch checklist (rotate the passcode, light up an
alert channel, reset demo data). The 1200×630 share card at `public/og-image.png` is what renders in
the link preview.

## Automation

The order pipeline runs end to end without anyone creating a factory order by hand:

1. **Submit** → email to the desk, WhatsApp to management, Slack if wired.
2. **Deposit confirmed** in `/admin` → the production request is emailed to the pressing plant
   (addresses, spec sheet, absolute download links for masters and artwork) and BCC'd to the desk.
3. **Failure** → the console marks the hand-off `failed` with the provider's error and offers retry.

The deposit is the gate: suppliers are never contacted before an admin confirms it in `/admin`, and
a manual *Forward* is refused with `409 deposit_required` until then. `PLANT_AUTO_FORWARD=false`
just means you press *Forward* yourself once the deposit has cleared. Setup, the WhatsApp template
wording and every variable:
[DEPLOYMENT.md → Automation](./DEPLOYMENT.md#automation--order--alerts--plant-no-manual-steps).

## Notifications

Alerts fire the moment an order is created. Channels are **env-gated and independent** — a channel
delivers only when its variables are present; otherwise it stays `simulated` and the console says so.

| Channel | Variables | Notes |
| --- | --- | --- |
| Slack | `SLACK_WEBHOOK_URL` | Incoming Webhook; rich blocks with client, package and money |
| Email | `RESEND_API_KEY`, `NOTIFY_EMAIL_TO`, `NOTIFY_EMAIL_FROM` | Resend; HTML + plain-text order sheet |
| WhatsApp | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `NOTIFY_WHATSAPP_TO` | Meta Cloud API; recipient must be opted in |
| Umbrella webhook | `NOTIFY_WEBHOOK_URL` | One JSON POST per channel — Zapier / Make / n8n / your bot |
| Plant forwarding | `PLANT_WEBHOOK_URL` (+ `PLANT_WEBHOOK_PLANT`, `PUBLIC_BASE_URL`) | Enables the admin “Forward to plant” action |
| Plant inboxes | `PLANT_MOBINEKO_EMAIL`, `PLANT_GREENLAKES_EMAIL`, `PLANT_SEABASS_EMAIL`, `PLANT_DRDUB_EMAIL`, `PLANT_GZMEDIA_EMAIL`, `PLANT_DEEPGROOVES_EMAIL` | Each plant's own rep inbox — where the spec sheet is emailed once the deposit is confirmed. The desk is BCC'd; the BCC is skipped when the addresses match |

Everything is optional — the app runs, and demos cleanly, with none of it set.

- Deliveries time out after 8 s and never throw: a dead endpoint marks the event `failed` with the
  error text in the log, and retry is one click away. Checkout is never blocked by an alert.
- `PUBLIC_BASE_URL` makes uploaded-file links absolute inside the alert; set it in production.
- Run `npm run test:notifications` to prove the whole path against a local HTTP sink — no
  credentials required (simulated → live Slack → failed endpoint → retry → umbrella fan-out).
- `npm run test:e2e` walks the real deployed site the way a client does (page → quote → upload →
  checkout → success → console) and prints response times, so a slow deploy is caught before a
  pitch. Pass a URL to point it elsewhere: `node scripts/e2e-live.mjs http://localhost:4173`.

## Project layout

```
api/index.js               # Vercel serverless entry (wraps the Express app)
vercel.json                # build, SPA rewrite, cache headers, function limits
shared/pricing.js          # single source of truth for catalogue + maths (client & server)
server/
  app.js                   # Express router: all /api routes, uploads, validation
  index.js                 # standalone server: API + Vite middleware / static dist
  auth.js                  # stateless HMAC admin sessions
  store.js                 # JSON store, demo seed, order ID generator
  webhooks.js              # simulated alert fan-out, plant payload, forwarding
  config.js                # env config, company details, payment rails
src/
  pages/                   # Landing, Order, Success, Admin, NotFound
  components/landing/      # Hero, Configurator, Process, Plants, Faq, CtaBand, Marquee
  components/order/        # Stepper, FileDropzone, OrderSummary
  components/ui/           # Icon set, Toast, Reveal, VinylDisc, Logo, StatusPill
  store/DraftContext.tsx   # configuration + client draft (sessionStorage)
scripts/smoke.mjs          # renders every route in jsdom, asserts no runtime errors
scripts/flow.mjs           # drives the full order flow in jsdom and verifies the API/admin
scripts/serverless-check.mjs # boots api/index.js with VERCEL=1 and checks the endpoints
.github/workflows/ci.yml   # typecheck → build → serverless checks → smoke → flow
```

## Tests

```
npm run typecheck          # tsc --noEmit
npm run test:serverless    # self-contained: boots the Vercel handler on an isolated /tmp store
npm run test:notifications # real-delivery harness: simulated → live → failed → retry → fan-out
node scripts/smoke.mjs     # route render smoke test (needs the app on :4173)
node scripts/flow.mjs      # end-to-end order placement + admin verification (needs :4173)
npm run test:e2e           # live end-to-end against production (or pass a URL)
npm test                   # typecheck + all four suites
```

## Notes

- Payments are **simulated**: no PSP is called. Deposits are confirmed manually in the console, and
  the success screen shows rail-specific instructions (MoMo `*165*3#`, Airtel `*185*9#`, SWIFT).
- Webhook deliveries are **real** as soon as credentials exist (see [Notifications](#notifications));
  without them they are simulated with staggered timers and clearly labelled `SIM` in the console.
- Rates and per-unit factory costs in `shared/pricing.js` are indicative and should be refreshed
  against plant quotes before invoicing.
- `data/` and `uploads/` are git-ignored; the store seeds two demo orders on first boot.
- On Vercel those directories move to `/tmp` (ephemeral). For persistent orders and files, follow
  the two-step storage swap in [DEPLOYMENT.md](./DEPLOYMENT.md#going-to-real-production-storage).
- The share card at `public/og-image.png` (1200×630) drives link previews in WhatsApp, Slack and
  X. Regenerate it with `npm run og-image` after changing the headline; the copy lives in
  `scripts/build-og-image.sh`.
- Admin sessions are HMAC-signed with `SESSION_SECRET` rather than stored server-side, so they
  survive across serverless instances; rotate the secret to invalidate every session.
