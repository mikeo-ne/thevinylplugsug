# Deploying 7H Music Group to Vercel

The repository is already wired for Vercel: the React app builds to `dist/` (served by
Vercel's CDN) and the Express API runs as one catch-all serverless function.

```
vercel.json                     build + output + /api rewrite + SPA rewrite + cache headers
api/index.js                    serverless entry — exports the Express app
server/app.js                   shared Express router (API only, no Vite)
server/index.js                 standalone server (local dev / Node hosting)
```

## 1. Push and merge

```bash
git switch arena/9cd70a33-thevinylplugsug
git push origin arena/9cd70a33-thevinylplugsug
gh pr create --base main --head arena/9cd70a33-thevinylplugsug --fill
gh pr merge <number> --merge
```

Once `main` is up to date, any Vercel project connected to this repository deploys on push.

## 2. Import the project on Vercel

1. **vercel.com → Add New → Project → Import Git Repository** and pick this repo.
2. Framework preset: **Vite** (auto-detected). Leave the build settings alone — `vercel.json`
   sets `npm run build` and `dist`.
3. Add the environment variables below before the first deploy.
4. Deploy. `https://<project>.vercel.app` serves the site; `/api/*` hits the function.

### Environment variables

| Variable         | Required | Example                              | Notes                                              |
| ---------------- | -------- | ------------------------------------ | -------------------------------------------------- |
| `ADMIN_PASSCODE` | **yes**  | `vinyl-ops-2027`                     | Change from the `7HADMIN` demo default             |
| `SESSION_SECRET` | **yes**  | `openssl rand -hex 32`               | Signs admin session tokens (stateless, 8-hour TTL) |
| `FX_UGX_PER_USD` | no       | `3750`                               | Indicative rate used across quotes                 |
| `MAX_UPLOAD_MB`  | no       | `4`                                  | Defaults to 4 on Vercel, 80 elsewhere              |
| `CONTACT_EMAIL`  | no       | `7hmusicgroupug@gmail.com`           | Shown in the footer, alerts and email replies      |
| `CONTACT_PHONE`  | no       | `+256 768 261 003`                   | Displayed phone number                             |
| `CONTACT_WHATSAPP` | no     | `256768261003`                       | Digits only — powers every `wa.me` link            |
| `MOMO_NUMBER`    | no       | `0768 261 003`                       | MTN merchant number shown at checkout              |
| `AIRTEL_NUMBER`  | no       | `0700 000 000`                       | Shows "Issued on your invoice" until set           |
| `BANK_ACCOUNT`   | no       | `Stanbic · 9030000000000`            | Shows "Issued on the invoice" until set            |
| `DATA_DIR`       | no       | `/tmp/7h-data`                       | Defaults to `/tmp/7h-data` on Vercel               |
| `UPLOAD_DIR`     | no       | `/tmp/7h-uploads`                    | Defaults to `/tmp/7h-uploads` on Vercel            |

Generate the secret locally and paste it into Vercel → Settings → Environment Variables
(Production **and** Preview):

```bash
openssl rand -hex 32
```

Redeploy after changing env vars — Vercel does not restart functions automatically.

### Automation — order → alerts → plant, no manual steps

The pipeline runs itself. What happens, in order:

| When | What fires | Needs |
| --- | --- | --- |
| Client submits an order | Email to the desk + WhatsApp to management (Slack too, if wired) | `RESEND_API_KEY`, `NOTIFY_EMAIL_TO` · `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `NOTIFY_WHATSAPP_TO` |
| You confirm the deposit in `/admin` | The production request is **emailed to the plant** with file links, and POSTed to their endpoint if you have one | `PLANT_MOBINEKO_EMAIL` / `PLANT_GREENLAKES_EMAIL` + `RESEND_API_KEY` |
| Order submitted (optional) | Release straight away instead of waiting for the deposit | `PLANT_FORWARD_ON_ORDER=true` |

Everything is idempotent: confirming the deposit twice never sends the plant a second copy,
and a failed hand-off shows as `failed` in the console with a one-click retry.

| Variable | Example | Notes |
| --- | --- | --- |
| `PLANT_MOBINEKO_EMAIL` | `web@mobineko.com` | Where Mobineko order requests go (published inbox — replace with your account rep once one is assigned) |
| `PLANT_GREENLAKES_EMAIL` | `hi@greenlakespressing.com` | Where Green Lakes order requests go (customer-service inbox — replace with your account rep once one is assigned) |
| `PLANT_ORDERS_EMAIL` | — | Catch-all used when a plant has no address of its own |
| `PLANT_AUTO_FORWARD` | `true` (default) | `false` restores the manual "Forward" button |
| `PLANT_FORWARD_ON_ORDER` | `false` (default) | `true` releases on submission, before the deposit |
| `PLANT_WEBHOOK_URL` | — | Optional JSON endpoint, used in addition to email |

The desk is BCC'd on every plant email, so a plant's reply always has a home. Verify the whole
chain without credentials: `npm run test:automation` (35 checks against a local sink).

### WhatsApp template

Business-initiated WhatsApp messages must use a pre-approved template. The app sends
`WHATSAPP_TEMPLATE_NAME` (default `new_vinyl_order`) with five body parameters, and falls back to
plain text if the template is not approved yet — which only works inside an open 24-hour window.

Submit this in Meta Business Suite → WhatsApp Manager → Message templates (category **Utility**):

```
New 7H vinyl order {{1}}
Artist: {{2}}
Spec: {{3}}
Turnkey total: {{4}}
Deposit due: {{5}}
Open the operations console to confirm the deposit and release the plant order.
```

The console shows the same sample under `/api/admin/overview → automation.whatsappTemplate`, so the
wording you submit always matches what the app sends. `WHATSAPP_TEMPLATE_LANG` defaults to `en_US` —
change it if you submit a different language.

### Notifications

Orders trigger alerts the moment they are created. Every channel is **optional and independent** —
the app only delivers where credentials exist, and the admin console labels each channel `LIVE` or
`SIM` so nobody mistakes a demo for a real alert.

| Channel            | Variables                                                                 | Where to get it                                                  |
| ------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Slack              | `SLACK_WEBHOOK_URL`                                                       | Slack → Apps → Incoming Webhooks                                  |
| Email (Resend)     | `RESEND_API_KEY`, `NOTIFY_EMAIL_TO`, `NOTIFY_EMAIL_FROM`                  | [resend.com](https://resend.com) → API Keys (verify the domain first) |
| WhatsApp (Cloud API) | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `NOTIFY_WHATSAPP_TO`             | Meta for Developers → WhatsApp → API Setup                        |
| Generic webhook    | `NOTIFY_WEBHOOK_URL`                                                      | Zapier / Make / n8n / your own endpoint                           |
| Plant forwarding   | `PLANT_WEBHOOK_URL` (+ optional `PLANT_WEBHOOK_PLANT`, `PUBLIC_BASE_URL`) | Your pressing plant's order API, if they have one                 |

Notes:

- `NOTIFY_WEBHOOK_URL` is an **umbrella**: when set, it fans out the same JSON payload for the
  slack, email and WhatsApp channels, so you can wire all alerts through one automation instead of
  configuring three providers.
- `PUBLIC_BASE_URL` makes file links in the alert absolute (e.g. `https://…/api/files/abc/download`).
  Set it; otherwise alerts contain relative paths.
- Deliveries have an 8-second timeout and never throw — a dead webhook marks the event `failed`
  with the error text in the admin log and retries are one click away. It never blocks checkout.
- `npm run test:notifications` proves the whole path locally against a throwaway HTTP sink (no
  credentials needed): simulated → live Slack → failed endpoint → retry → umbrella fan-out.
- WhatsApp Cloud API only delivers to numbers opted into your business, and outside the 24-hour
  customer window it needs a pre-approved template. For a first client pitch, Slack + email is the
  fastest reliable path; add WhatsApp when the Meta template is approved.


## 3. What happens on Vercel (and its limits)

Vercel functions have an **ephemeral, per-instance filesystem**. To keep the demo working out of
the box, the app:

- writes the JSON store to `/tmp/7h-data/db.json` and re-seeds the two demo orders on a cold start;
- writes uploads to `/tmp/7h-uploads`, which are served via `/api/files/:id/download`;
- signs admin tokens with `SESSION_SECRET`, so a login survives across different instances;
- reconciles simulated webhook deliveries from timestamps at read time, so the alert log still
  resolves when a function freezes right after responding.

Consequences:

- **Direct uploads are capped at 4 MB** on Vercel (the platform rejects larger request bodies
  before Express sees them). The portal reads `MAX_UPLOAD_MB` from `/api/config` and steers clients
  to WeTransfer / Drive / Dropbox links for anything larger.
- Orders and files do **not** persist across cold starts, regions, or concurrent instances. That is
  fine for a demo or a single-session pitch, not for live client orders.

### Going to real production storage

Two focused swaps, no API changes:

1. **Files → Vercel Blob** (`@vercel/blob`)
   - Replace multer disk storage in `server/app.js` (`POST /api/uploads`) with
     `put(file.originalname, file.buffer, { access: 'public' })` and store the returned URL on the
     upload record (use `multer.memoryStorage()`).
   - Point `/api/files/:id/download` at the blob URL (302 redirect) instead of `res.sendFile`.
2. **Orders/events → Postgres (Neon/Vercel Postgres) or Upstash Redis**
   - `server/store.js` is the only module that touches persistence (`db_.data`, `db_.save()`,
     `db_.reset()`). Keep those three call sites and swap the JSON file for SQL/KV reads and writes.
   - Seed catalogue/demo rows the same way `seedDemo()` does today.

Everything else — quotes, validation, webhook fan-out, admin actions — is storage-agnostic.

## 4. Verify before you merge

```bash
npm run typecheck
npm run build
npm run test:serverless   # boots api/index.js with VERCEL=1
node scripts/smoke.mjs    # needs the app running on :4173
node scripts/flow.mjs
```

`npm test` runs typecheck + the serverless check; the two jsdom scripts need a live server
(`npm run dev` or `npm start` after `npm run build`).

CLI deploy, if you prefer the terminal:

```bash
npx vercel link
npx vercel env pull .env.local
npx vercel --prod
```

## 5. Post-deploy checklist

- [ ] `https://<project>.vercel.app` loads the hero and the lime configurator updates totals.
- [ ] `/order` completes and lands on `/order/7H-XXXX` with deposit instructions.
- [ ] `/admin` accepts your new `ADMIN_PASSCODE`, shows the order, and the webhook log resolves.
- [ ] "Forward" produces the plant payload and flips the order to **Sent to plant**.
- [ ] Custom domain added (Vercel → Domains) and `ADMIN_PASSCODE` rotated away from the demo value.
- [ ] `npm run test:e2e` passes against the production URL (41 checks, ~2 s).
- [ ] At least one alert channel is live — the console banner is gone and the header reads
      `live delivery`. See [Notifications](#notifications).
- [ ] A WhatsApp/Slack paste of the link shows the 1200×630 share card (previews can cache for a
      while — re-scrape in Slack's app settings if the old preview sticks).
