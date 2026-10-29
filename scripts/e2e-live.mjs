/**
 * Live end-to-end check against a real deployment (production or local).
 *
 *   node scripts/e2e-live.mjs                        # defaults to production
 *   node scripts/e2e-live.mjs http://localhost:4173  # against the dev server
 *   E2E_ADMIN_PASSCODE=... node scripts/e2e-live.mjs
 *
 * Walks the exact path a client takes on a phone or laptop: quote → artwork +
 * audio upload → checkout → success screen → admin sees it. It uses the real
 * HTTP API, not jsdom, so it proves the deployed site works, not just the code.
 */

const BASE = (process.argv[2] ?? process.env.E2E_BASE ?? 'https://thevinylplugsug.vercel.app').replace(/\/$/, '');
const PASSCODE = process.env.E2E_ADMIN_PASSCODE ?? '7HADMIN';

let pass = 0;
let fail = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

const step = (label) => console.log(`\n▸ ${label}`);

const get = async (path, init = {}) => {
  const started = Date.now();
  const res = await fetch(`${BASE}${path}`, init);
  const ms = Date.now() - started;
  return { res, ms };
};

const json = async (path, init) => {
  const { res, ms } = await get(path, init);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { res, ms, body };
};

const timed = (label, ms, budget = 3000) =>
  check(ms <= budget, `${label} responded in ${ms} ms`, `budget ${budget} ms`);

console.log(`\n7H MUSIC GROUP — live end-to-end check\n${BASE}\n${'─'.repeat(52)}`);

/* 1 ── the page itself ---------------------------------------------------- */
step('Landing page (what a client sees first)');
{
  const { res, ms } = await get('/');
  const html = await res.text();
  check(res.ok, 'GET / returns 200', `status ${res.status}`);
  timed('landing page', ms, 4000);
  check(/<div id="root">/.test(html), 'React mount point present');
  check(/og:image/.test(html), 'social share card wired (og:image)');
  check(/Press Your Sound on Vinyl/.test(html), 'headline copy is in the HTML');
  check(/name="viewport"[^>]+width=device-width/.test(html), 'mobile viewport meta present');
  // production serves /assets/index-*.js, the dev server serves /src/main.tsx
  const asset = html.match(/<script[^>]+src="([^"]+)"/)?.[1];
  check(Boolean(asset), 'app script referenced', asset ?? 'none');
  if (asset) {
    const bundle = await get(asset.startsWith('http') ? asset.replace(BASE, '') : asset);
    check(bundle.res.ok, 'app script downloads', `status ${bundle.res.status}`);
  }
  const og = await get('/og-image.png');
  check(og.res.ok && og.res.headers.get('content-type')?.includes('image'), 'og-image.png serves', `status ${og.res.status}`);
}

/* 2 ── config + quote ----------------------------------------------------- */
step('Catalogue and quote math (configurator)');
const config = await json('/api/config');
check(config.res.ok, 'GET /api/config', `status ${config.res.status}`);
const cfg = config.body;
check(Array.isArray(cfg?.quantities) && cfg.quantities.length === 3, 'three quantity tiers', String(cfg?.quantities));
check(cfg?.managementFeeRate === 0.25, 'management fee is 25%', String(cfg?.managementFeeRate));
check(cfg?.depositRate === 0.5, 'deposit is 50%', String(cfg?.depositRate));

const quoteReq = {
  quantity: 250,
  vinylTypeId: cfg.vinylTypes[1].id,
  sleeveId: cfg.sleeves[1].id,
};
const quote = await json('/api/quote', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(quoteReq),
});
const q = quote.body?.quote ?? {};
const totalUsd = q.totals?.total?.usd;
const totalUgx = q.totals?.total?.ugx;
check(quote.res.ok, 'POST /api/quote', `status ${quote.res.status}`);
check(totalUsd > 0, 'quote returns a USD total', `$${totalUsd}`);
check(totalUgx === Math.round(totalUsd * cfg.fxRate), 'UGX total = USD × FX', `UGX ${totalUgx}`);
check(q.deposit === Math.round(totalUsd * 0.5 * 100) / 100, 'deposit is exactly half', `$${q.deposit}`);
check(q.managementFee === Math.round(q.factoryCost * 0.25 * 100) / 100, 'fee is 25% of factory cost', `$${q.managementFee}`);
timed('quote', quote.ms, 2500);

/* 3 ── uploads ------------------------------------------------------------ */
step('File upload (audio master + artwork, as the portal does)');
const stamp = Date.now().toString(36).toUpperCase();
const mkForm = (role, filename, type, bytes) => {
  const form = new FormData();
  form.append('role', role);
  form.append(role, new Blob([bytes], { type }), filename);
  return form;
};

const wavHeader = new Uint8Array(44);
wavHeader.set([0x52, 0x49, 0x46, 0x46]); // RIFF
const audioRes = await fetch(`${BASE}/api/uploads`, { method: 'POST', body: mkForm('audio', `E2E_${stamp}_master.wav`, 'audio/wav', wavHeader) });
const audio = await audioRes.json().catch(() => ({}));
const audioRecord = audio?.uploads?.[0];
check(audioRes.ok, 'audio upload accepted', `status ${audioRes.status}`);
check(Boolean(audioRecord?.url), 'upload returns a download link', audioRecord?.url ?? 'none');

const pngMagic = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Uint8Array(64)]);
const artRes = await fetch(`${BASE}/api/uploads`, { method: 'POST', body: mkForm('artwork', `E2E_${stamp}_cover.pdf`, 'application/pdf', pngMagic) });
const art = await artRes.json().catch(() => ({}));
const artRecord = art?.uploads?.[0];
check(artRes.ok, 'artwork upload accepted', `status ${artRes.status}`);

const fileLink = audioRecord?.url;
if (fileLink) {
  const dl = await get(fileLink);
  check(dl.res.ok, 'uploaded file downloads back', `status ${dl.res.status}`);
}

/* 4 ── checkout ----------------------------------------------------------- */
step('Checkout (client submits the order)');
const order = await json('/api/orders', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    client: {
      name: `E2E Check ${stamp}`,
      email: `e2e+${stamp.toLowerCase()}@7hmusic.group`,
      phone: '+256700411700',
      deliveryType: 'uganda',
      deliveryAddress: 'Plot 14, Bukoto Street, Kampala',
      deliveryCity: 'Kampala',
      country: 'Uganda',
      notes: 'Automated end-to-end check — safe to delete.',
    },
    configuration: quoteReq,
    payment: { method: 'mtn_momo' },
    uploads: {
      audio: [audioRecord?.id].filter(Boolean),
      artwork: [artRecord?.id].filter(Boolean),
    },
    termsAccepted: true,
    plantPreference: 'mobineko',
  }),
});
check(order.res.ok, 'POST /api/orders creates the order', `status ${order.res.status}`);
const orderId = order.body?.order?.id;
if (!order.res.ok) console.log(`   server said: ${JSON.stringify(order.body).slice(0, 240)}`);
check(/^7H-\d{4}-[A-Z0-9]{4}$/.test(orderId ?? ''), 'order id has the 7H format', String(orderId));
timed('checkout', order.ms, 5000);

const status = await json(`/api/orders/${orderId}`);
check(status.res.ok, 'success screen data loads', `status ${status.res.status}`);
check(Boolean(status.body?.order), 'order payload returned');
const alerts = status.body?.events ?? [];
check(alerts.length >= 3, 'alert fan-out recorded', `${alerts.length} events`);
check(alerts.some((e) => e.channel === 'slack'), 'slack alert on the feed');
check(alerts.some((e) => e.channel === 'email'), 'email alert on the feed');
check(alerts.some((e) => e.channel === 'whatsapp'), 'whatsapp alert on the feed');

/* 5 ── admin -------------------------------------------------------------- */
step('Operations console');
const login = await json('/api/admin/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ passcode: PASSCODE }),
});
check(login.res.ok && Boolean(login.body?.token), 'admin login', `status ${login.res.status}`);
const auth = login.body?.token ? { headers: { 'x-admin-token': login.body.token } } : { headers: {} };
const overview = await json('/api/admin/overview', auth);
check(overview.res.ok, 'admin overview loads', `status ${overview.res.status}`);
check(
  (overview.body?.orders ?? []).some((o) => o.id === orderId),
  'new order appears in the console',
);
check(Boolean(overview.body?.notifications), 'notification channel status exposed');
if (overview.body?.notifications) {
  const note = overview.body.notifications;
  check(typeof note.configured === 'boolean', 'alerts report a configured flag');
  const chans = note.channels ?? [];
  check(chans.length >= 3, 'per-channel status listed', chans.map((c) => c.channel).join(', '));
  check(chans.every((c) => c.mode === 'live' || c.mode === 'simulated'), 'each channel reports live/simulated');
  const live = chans.filter((c) => c.live).map((c) => c.channel);
  console.log(`   alerts configured: ${note.configured ? 'YES — delivering for real' : 'no — simulated (set SLACK_WEBHOOK_URL etc.)'}`);
  console.log(`   live channels: ${live.length ? live.join(', ') : 'none yet'}`);
  const modes = [...new Set((overview.body.events ?? []).filter((e) => e.orderId === orderId).map((e) => e.mode))];
  console.log(`   delivery modes this order: ${modes.join(', ') || 'n/a'}`);
}

/* 6 ── unknown routes stay honest ---------------------------------------- */
step('Error handling (a client taps a stale link)');
const missing = await json('/api/orders/NOPE-0000');
check(missing.res.status === 404 && /not found/i.test(JSON.stringify(missing.body)), 'unknown order → clean 404 JSON');
const deep = await get('/order/E2E-NOT-REAL');
check(deep.res.ok, 'unknown order page still renders the app shell', `status ${deep.res.status}`);

/* ── summary -------------------------------------------------------------- */
console.log(`\n${'─'.repeat(52)}`);
console.log(`${pass}/${pass + fail} checks passed${fail ? ` — ${fail} FAILED` : ' — the live site is pitch-ready'}`);
console.log(`Test order: ${orderId ?? 'n/a'} (delete it from /admin before a real client demo)\n`);
process.exit(fail ? 1 : 0);
