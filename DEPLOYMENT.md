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
| `FX_UGX_PER_USD` | no       | `4360`                               | Safety rate and UGX floor (never quote below it) |
| `FX_API_URL`     | no       | `https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP` | Live EUR/GBP |
| `FX_UGX_API_URL` | no       | `https://open.er-api.com/v6/latest/USD` | Live UGX (Frankfurter has no shilling) |
| `FX_CACHE_SECONDS` | no     | `3600`                               | How long a fetched rate is reused                  |
| `FX_STALE_SECONDS` | no     | `21600`                              | How long a stale rate may still be quoted in an outage |
| `FX_UGX_FLOOR`   | no       | `4360`                               | Never quote UGX below this, whatever the market does |
| `MAX_UPLOAD_MB`  | no       | `4`                                  | Defaults to 4 on Vercel, 80 elsewhere              |
| `CONTACT_EMAIL`  | no       | `7hmusicgroupug@gmail.com`           | Shown in the footer, alerts and email replies      |
| `CONTACT_PHONE`  | no       | `+256 768 261 003`                   | Displayed phone number                             |
| `CONTACT_WHATSAPP` | no     | `256768261003`                       | Digits only — powers every `wa.me` link            |
| `MOMO_NUMBER`    | no       | `0768 261 003`                       | MTN merchant number shown at checkout              |
| `AIRTEL_NUMBER`  | no       | `0700 000 000`                       | Shows "Issued on your invoice" until set           |
| `BANK_ACCOUNT`   | no       | `Stanbic · 9030000000000`            | Shows "Issued on the invoice" until set            |
| `DATA_DIR`       | no       | `/tmp/7h-data`                       | Defaults to `/tmp/7h-data` on Vercel               |
| `UPLOAD_DIR`     | no       | `/tmp/7h-uploads`                    | Defaults to `/tmp/7h-uploads` on Vercel            |
| `DATABASE_URL`   | **yes** (for real orders) | `postgres://…?sslmode=require` | Postgres. Without it, orders live in `/tmp` and vanish on a cold start. See §3 |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | no | from Vercel KV / Upstash | Alternative durable store (Redis) instead of Postgres |
| `CRON_SECRET`    | no       | `openssl rand -hex 24`               | Lets Vercel's daily cron retry failed alerts; unset = route off |
| `RESEND_API_KEY` | no       | `re_…`                               | Real email. Unset = email alerts are simulated     |
| `NOTIFY_EMAIL_TO`| no (with Resend) | `7hmusicgroupug@gmail.com, you@…` | Who receives desk alerts                    |
| `NOTIFY_EMAIL_FROM` | no    | `7H Music Group <alerts@yourdomain>` | Sender; `onboarding@resend.dev` works before the domain is verified |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | no | from @BotFather | Real phone alerts in minutes, no business account. Several chat ids, comma separated |
| `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_ID` / `NOTIFY_WHATSAPP_TO` | no | from Meta | Real WhatsApp alerts (needs a verified business + approved template) |
| `SLACK_WEBHOOK_URL` | no    | `https://hooks.slack.com/services/…` | Alerts into a Slack channel                       |
| `NOTIFY_WEBHOOK_URL` | no   | `https://hooks.zapier.com/…`         | One endpoint for every channel (Zapier/Make/n8n)   |

Generate the secret locally and paste it into Vercel → Settings → Environment Variables
(Production **and** Preview):

```bash
openssl rand -hex 32
```

Redeploy after changing env vars — Vercel does not restart functions automatically.

### Live currency

Rates are fetched on load, on demand at `/api/rates` and cached (in the function for
`FX_CACHE_SECONDS`, and in the browser's session for an hour) — so the shop stays fast and the
provider sees a handful of calls an hour. **USD is the base**: quotes, the 25% fee, the deposit and
every stored order stay in dollars; a display currency is only ever a multiplication. UGX is locked
for Uganda delivery, EUR for Europe, GBP for the UK and USD everywhere else, and the visitor can
override any of it with the switcher.

If the feed fails there are three fallbacks, in order: the last good quote (up to
`FX_STALE_SECONDS`), then the safety table (UGX at the floor, no EUR/GBP), then USD only. A
checkout never waits on the provider — after 900 ms it takes the floor and carries on. The rate is
also **floored, never capped**: a stronger shilling cannot push UGX below `FX_UGX_FLOOR`, and a
weaker one passes straight through, so a shilling invoice always covers its dollar total. The footer
of a quote says which source it used, so nobody is guessing.

**Keep `FX_UGX_PER_USD` current.** It is now the safety rate and the floor It is the rate every local price is multiplied by — the quote, the
25% fee, the 50% deposit, the shop's UGX labels and the console totals. Set it at or just above the
mid-market rate (Wise shows USD/UGX live) and re-check it monthly, or whenever the shilling moves;
a stale rate is how a dollar quote quietly becomes a loss on a UGX invoice. It is currently
**4,360** (reviewed 2026-10-29). Changing it needs no code change — but it does need a redeploy, or
`npx vercel --prod` again if you edit it from the CLI.

### Automation — order → alerts → plant, no manual steps

The pipeline runs itself. What happens, in order:

| When | What fires | Needs |
| --- | --- | --- |
| Client submits an order | Email to the desk + WhatsApp to management (Slack too, if wired) | `RESEND_API_KEY`, `NOTIFY_EMAIL_TO` · `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `NOTIFY_WHATSAPP_TO` |
| You confirm the deposit in `/admin` | The production request is **emailed to the plant the client chose** (MOQ-checked) with file links, and POSTed to their endpoint if you have one | `PLANT_*_EMAIL` + `RESEND_API_KEY` |

**The deposit is the gate.** Nothing reaches a supplier before an admin presses *Mark deposit
paid* in `/admin`: a manual *Forward* is refused with `409 deposit_required` until then, and the
console shows the hand-off as held back with the reason. `PLANT_AUTO_FORWARD=false` only decides
whether the request goes out on its own at that moment or when you press *Forward* — it never
releases an order earlier.

Everything is idempotent: confirming the deposit twice never sends the plant a second copy,
and a failed hand-off shows as `failed` in the console with a one-click retry.

| Variable | Example | Notes |
| --- | --- | --- |
| `PLANT_MOBINEKO_EMAIL` | `web@mobineko.com` | Where Mobineko order requests go (published inbox — replace with your account rep once one is assigned) |
| `PLANT_GREENLAKES_EMAIL` | `hi@greenlakespressing.com` | Where Green Lakes order requests go (customer-service inbox — replace with your account rep once one is assigned) |
| `PLANT_SEABASS_EMAIL` | `orders@seabassvinyl.com` | Seabass Vinyl (UK, MOQ 50) — the rep's own order inbox |
| `PLANT_DRDUB_EMAIL` | `info@drdub.com` | Dr. Dub (AT, lathe cuts, MOQ 1) |
| `PLANT_GZMEDIA_EMAIL` | `gz@gzmedia.cz` | GZ Media (CZ, MOQ 250) |
| `PLANT_DEEPGROOVES_EMAIL` | `info@deepgrooves.eu` | Deepgrooves (NL, MOQ 100) |
| `PLANT_ORDERS_EMAIL` | — | Catch-all used when a plant has no address of its own |
| `PLANT_AUTO_FORWARD` | `true` (default) | `false` waits for the manual "Forward" button — still only after the deposit |
| `PLANT_WEBHOOK_URL` | — | Optional JSON endpoint, used in addition to email |

Each plant has its own rep inbox, so the request lands with the people pressing the record. The desk
is BCC'd on every plant email, so a reply always has a home; if a plant's inbox *is* the desk
address, that BCC is skipped (one mailbox, one copy). The subject line names the plant as well, so a
forwarded thread is still obvious.

### The record shop

`/shop` sells the catalogue one record at a time — a different pipeline from a pressing order, and
the console keeps them apart.

| Variable | Default | Notes |
| --- | --- | --- |
| `SHOP_ORDERS_PER_MINUTE` | `12` | Per-IP ceiling on shop checkouts. Raise it for a launch, or for a load test |
| `FX_UGX_PER_USD` | `4360` | Safety rate and UGX floor; also the offline price for the shop |

- Retail prices and delivery fees live in `shared/shop.js` — one file, read by the page, the API and
  the console. Edit it, deploy, done. Stock is *not* in the code: it starts at the opening count and
  then lives in the store, managed from the console.
- A sale decrements stock in the same synchronous pass that accepts the order, so the last copy
  cannot be sold twice on one instance. A stale page that tries it gets `409 out_of_stock`.
- Every sale emails the desk (with the buyer’s receipt BCC’d), sends the WhatsApp alert, and — when
  configured — posts to the generic webhook as `shop.order.placed`.
- **Stock is held by the database, not by the page.** The checkout reserves it with a conditional
  update, so two fans on two instances cannot both buy the last copy. Without `DATABASE_URL` the
  shop still runs, but on `/tmp` — a cold start re-seeds the opening counts and the order list
  resets. That is fine for a pitch and for a single
  busy instance; before running real retail traffic, move the store to Postgres/Redis (see
  [Going to real production storage](#going-to-real-production-storage)). The desk email on every
  sale is what keeps an order from disappearing with the instance.

### Run sizes and the plant panel

`shared/pricing.js` is the single source of truth for the seven run sizes (1, 25, 50, 100, 250,
500, 1,000), the per-unit price at each, and each plant's MOQ, cap, lead time and rate card. The
configurator disables plants that cannot take the selected run, and the order is re-routed to the
cheapest eligible plant if the client shrinks the run below their plant's MOQ.

Add a plant by adding one object to `PRESSING_PLANTS` — the dropdown, the brokerage section, the
quote maths and the automated hand-off all read from it. Point `ordersEmail` at that plant's inbox
via an env var so the deposit-confirmation email has somewhere to land. Verify the whole
chain without credentials: `npm run test:automation` (35 checks against a local sink).

### Telegram (the five-minute alert rail)

Meta wants a verified business, a phone number that is not already on WhatsApp, and an approved
Utility template before it will deliver a business-initiated message. Telegram wants a token. For a
desk that just needs the order on a phone, this is the rail to set up first.

1. Install Telegram, message **@BotFather** → `/newbot` → name it (`7H Orders`) → copy the token.
2. Open your new bot and press **Start** (a bot cannot message someone who never started it).
3. Read your chat id. Either `https://api.telegram.org/bot<TOKEN>/getUpdates` →
   `result[0].message.chat.id`, or — easier — set `TELEGRAM_BOT_TOKEN` first and press **Find chat
   id** under the Telegram row in **Console → System**. It asks the Bot API and lists every chat that
   has messaged the bot, with a copy button. A group id is negative (`-100…`); add the bot to the
   group first.
4. Vercel → Settings → Environment Variables: `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.
   Several destinations are fine, comma separated: a DM *and* a group, for instance.
5. Console → **System → Send test alert** — a green Telegram line means the phone buzzes.

Every pressing order and every fan purchase sends one message: order reference, artist, spec, total,
deposit, the **full ship-to address**, and — for pressing orders — the reminder that nothing reaches
the plant until the deposit is confirmed. Same message body as the email, sized for a phone.

`TELEGRAM_API_BASE` exists only so `npm run test:alerts` can point the bot at a local sink; leave it
unset in production.

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


### Alerts that actually send

There are two honest states for an alert: it left, or it did not. The console shows which.

1. **Email (recommended first).** [resend.com](https://resend.com) → sign up with the desk address →
   **API Keys → Create** → paste as `RESEND_API_KEY` in Vercel. Set `NOTIFY_EMAIL_TO` to the desk
   inbox. Before you verify a domain, Resend only lets you send from `onboarding@resend.dev` *to the
   address that owns the account* — which is exactly the desk inbox, so this works immediately for
   internal alerts. When you are ready for buyer receipts, verify `7hmusicgroup.com` and set
   `NOTIFY_EMAIL_FROM=7H Music Group <orders@7hmusicgroup.com>`.
2. **Telegram.** The shortest path to a buzzing phone — see **Telegram** above. No business account,
   no template review, and it works on a personal phone or a group.
3. **WhatsApp.** Meta for Developers → your app → WhatsApp → API Setup gives `WHATSAPP_TOKEN` and
   `WHATSAPP_PHONE_ID`; set `NOTIFY_WHATSAPP_TO` to the digits of the phone that should buzz. Outside
   a 24-hour window Meta only accepts an approved template — submit the body printed in
   **WhatsApp template** above (category *Utility*) and keep `WHATSAPP_TEMPLATE_NAME` in step.
4. **Prove it.** Console → **System** → **Send test alert**. It makes one real call per configured
   channel and prints the provider's own answer next to it — a green line means the message left,
   and a rejection shows Resend's or Meta's exact wording (invalid key, unverified domain, template
   not approved) instead of a silent failure.
5. **Nothing gets lost.** Every attempt is written to the alert log. Failures sit in the outbox with
   their error and attempt count, **Retry failed** re-sends them on demand, and with `CRON_SECRET`
   set the daily cron in `vercel.json` retries whatever is still failing (up to five attempts each).

`npm run test:alerts` exercises all of this against a local sink, including a provider rejection and
the retry sweep — no credentials required.

## 3. Where the data lives

Out of the box the app writes a JSON document to disk. That is fine on a laptop and **not** fine on
Vercel, where the filesystem is per-instance and wiped on every cold start. One environment variable
fixes it:

| Variable | What to paste |
| --- | --- |
| `DATABASE_URL` | A Postgres connection string. Neon, Supabase, Vercel Postgres, RDS — anything that speaks the protocol. `POSTGRES_URL` and `POSTGRES_PRISMA_URL` are accepted too, because that is what the Vercel Neon integration injects. |

### Get a database (about three minutes)

1. Either **Vercel → Storage → Create database → Neon** (it injects the connection string into the
   project for you — no copy-paste), or [neon.tech](https://neon.tech) → **New project** (free tier
   is plenty; pick the region closest to your users, e.g. `eu-central-1`).
2. Copy the **connection string** — it looks like
   `postgres://user:password@ep-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`.
3. Vercel → project → **Settings → Environment Variables** → add `DATABASE_URL` for
   *Production*, *Preview* and *Development*, then **redeploy**.
4. Optional but useful: run the migration once from your machine so you can watch it happen.

```bash
DATABASE_URL='postgres://…' npm run db:migrate -- --check          # connect, no writes
DATABASE_URL='postgres://…' npm run db:migrate                      # create tables, seed stock
DATABASE_URL='postgres://…' npm run db:migrate -- --import data/db.json   # bring old local orders along
```

The schema is created idempotently — `pressing_orders`, `shop_orders`, `uploads`, `alert_events`,
`shop_stock`, `store_meta` — so no separate migration tool is required.

**A fresh database starts empty.** The two sample pressing orders only exist in the local file store
(a laptop demo, or `SEED_DEMO=true`); a real database boots with the catalogue's opening stock and
nothing else. Use the console's *Reset demo* if you ever want the samples back.

**Rather use Redis?** Vercel KV and Upstash both work: add `KV_REST_API_URL` + `KV_REST_API_TOKEN`
(the names Upstash uses, `UPSTASH_REDIS_REST_URL` / `…_TOKEN`, also work) and the app switches to the
Redis driver. Postgres is the better default: it is the one that can enforce "don't oversell" with a
conditional `UPDATE`.

### What changed under the hood

`server/db/` picks the driver once, at boot:

| Driver | Chosen when | Durable? |
| --- | --- | --- |
| `postgres` | `DATABASE_URL` is set | yes |
| `redis` | KV / Upstash REST variables are set | yes |
| `file` | nothing is configured | no — sits on `/tmp` on Vercel |

`server/store.js` keeps exactly the same API (`db_.data`, `db_.save()`, `db_.reset()`), so quotes,
webhook fan-out and the console did not change. Saves are **diffed**: only rows that moved are
written, in one transaction, which keeps two function instances from clobbering each other's work.

Shop stock is stricter than everything else. Taking a record out of stock is a conditional
`UPDATE … WHERE stock >= n` inside a transaction (or an atomic `HINCRBY` on Redis): if two fans tap
Buy on the last copy at the same moment, exactly one order is accepted and the other is told the
record just sold out.

The console's **System** panel says which driver is live, whether it survives a deploy, and how many
rows it holds — and `GET /api/health` reports the same thing publicly (no secrets) for uptime checks.

## 4. What happens on Vercel (and its limits)

Vercel functions have an **ephemeral, per-instance filesystem**. With a database configured that no
longer matters for orders, stock or the alert log; it still matters for two things:

- **Uploaded masters and artwork** land in `/tmp/7h-uploads` and are served by
  `/api/files/:id/download`. They vanish on a cold start, so a real client should send a
  WeTransfer / Drive / Dropbox link (the portal offers that) until uploads move to Vercel Blob.
- **Direct uploads are capped at 4 MB** on Vercel — the platform rejects larger bodies before
  Express sees them. The portal reads `MAX_UPLOAD_MB` from `/api/config` and steers clients
  accordingly.

Moving uploads to Blob is a single swap: `multer.memoryStorage()` + `put()` in `POST /api/uploads`,
and a 302 to the blob URL in `/api/files/:id/download`.

## 5. Verify before you merge

```bash
npm run typecheck
npm run build
npm run test:serverless   # boots api/index.js with VERCEL=1
npm run test:db           # Postgres (PGlite) + Redis drivers, schema, atomic stock
npm run test:alerts       # every alert channel against a local sink, incl. retries
node scripts/smoke.mjs    # needs the app running on :4173
node scripts/flow.mjs
```

`npm test` runs typecheck and every self-contained suite; the two jsdom scripts need a live server
(`npm run dev` or `npm start` after `npm run build`).

CLI deploy, if you prefer the terminal:

```bash
npx vercel link
npx vercel env pull .env.local
npx vercel --prod
```

## 6. Post-deploy checklist

- [ ] `https://<project>.vercel.app` loads the hero and the lime configurator updates totals.
- [ ] `/order` completes and lands on `/order/7H-XXXX` with deposit instructions.
- [ ] `/admin` accepts your new `ADMIN_PASSCODE`, shows the order, and the webhook log resolves.
- [ ] "Forward" produces the plant payload and flips the order to **Sent to plant**.
- [ ] Custom domain added (Vercel → Domains) and `ADMIN_PASSCODE` rotated away from the demo value.
- [ ] `npm run test:e2e` passes against the production URL (41 checks, ~2 s).
- [ ] `/api/health` reports `"driver": "postgres"` and `"persistent": true` — and the console's
      **System** panel says the same thing. See [§3](#3-where-the-data-lives).
- [ ] At least one alert channel is live — the console banner is gone and the header reads
      `live delivery`. See [Notifications](#notifications).
- [ ] **System → Send test alert** comes back green for email (and WhatsApp if configured).
- [ ] A WhatsApp/Slack paste of the link shows the 1200×630 share card (previews can cache for a
      while — re-scrape in Slack's app settings if the old preview sticks).
