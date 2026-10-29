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
| `ADMIN_PASSCODE`  | `7HADMIN`   | Access code for the operations console         |
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
- Ticker, four-step process, pressing-partner cards, audience grid, FAQ accordion, closing CTA.

### 2. Quote configurator (`/#configurator`)
- Quantity: **100 / 250 / 500**
- Format: **12" LP Standard**, **12" Colored**, **7" Single**
- Packaging: **Standard Jacket**, **Gatefold**, **Printed Inner Sleeve**
- Live maths (animated): pressing + sleeve upgrade + factory setup → **Total factory cost** →
  **7H management fee @ 25%** → **Turnkey total** shown in **USD and UGX**, with the **50% deposit**
  and balance. Volume-savings hint is derived from the same engine.

```
factory  = qty × unit(format) + qty × unit(sleeve) + format setup fee
fee      = factory × 25%
total    = factory + fee
deposit  = total × 50%
```

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

### 5. Operations console (`/admin`, code `7HADMIN`)
- Summary tiles: pipeline value, orders, units, deposits collected, needs action, open alerts.
- Order list with filters + detail panel: client, package, money, downloadable file links.
- Actions: **mark deposit paid**, **forward to Mobineko / Green Lakes**, change status, copy the
  plant payload.
- **Webhook alert log** — automatically fires on every order to Slack, email, WhatsApp and plant
  intake, with delivery states, retries, a manual “test alert”, and a demo reset. The console polls
  every six seconds while the tab is visible.

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
node scripts/smoke.mjs     # route render smoke test (needs the app on :4173)
node scripts/flow.mjs      # end-to-end order placement + admin verification (needs :4173)
npm test                   # typecheck + serverless checks
```

## Notes

- Payments are **simulated**: no PSP is called. Deposits are confirmed manually in the console, and
  the success screen shows rail-specific instructions (MoMo `*165*3#`, Airtel `*185*9#`, SWIFT).
- Webhook “deliveries” are simulated locally with staggered timers; wire `server/webhooks.js` to
  real Slack / Resend / WhatsApp Cloud API endpoints to go live.
- Rates and per-unit factory costs in `shared/pricing.js` are indicative and should be refreshed
  against plant quotes before invoicing.
- `data/` and `uploads/` are git-ignored; the store seeds two demo orders on first boot.
- On Vercel those directories move to `/tmp` (ephemeral). For persistent orders and files, follow
  the two-step storage swap in [DEPLOYMENT.md](./DEPLOYMENT.md#going-to-real-production-storage).
- Admin sessions are HMAC-signed with `SESSION_SECRET` rather than stored server-side, so they
  survive across serverless instances; rotate the secret to invalidate every session.
