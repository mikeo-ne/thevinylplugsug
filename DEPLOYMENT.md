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
| `DATA_DIR`       | no       | `/tmp/7h-data`                       | Defaults to `/tmp/7h-data` on Vercel               |
| `UPLOAD_DIR`     | no       | `/tmp/7h-uploads`                    | Defaults to `/tmp/7h-uploads` on Vercel            |

Generate the secret locally and paste it into Vercel → Settings → Environment Variables
(Production **and** Preview):

```bash
openssl rand -hex 32
```

Redeploy after changing env vars — Vercel does not restart functions automatically.

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
