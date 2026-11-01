/**
 * Plant desk checks.
 *
 * The brief's point 6 — "I have to go to all six plant websites and fill in the
 * same specs over and over" — and point 5's worry — "don't let my price end up
 * below the plant's". Both are proved here against the real API:
 *
 *   · every plant's profile carries an intake channel and a dated source;
 *   · the verified minimums are the plants' published ones, so a run they will
 *     refuse cannot be quoted;
 *   · a sheet is built from the order, names what that plant insists on, and
 *     flags what the portal cannot supply;
 *   · the tracklist travels from the order form to the sheet (GZ checks it);
 *   · a recorded plant quote that exceeds the client's price marks the order as a
 *     loss and blocks the forward — while the deposit gate still holds underneath;
 *   · the invoice carries the company TIN.
 *
 * Run with `npm run test:plants`.
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let passed = 0;
const failures = [];
const check = (name, condition, detail) => {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), '7h-plants-'));
process.env.DATA_DIR = dataDir;
process.env.UPLOAD_DIR = dataDir;
process.env.NODE_ENV = 'test';
process.env.ADMIN_PASSCODE = '7HADMIN';
process.env.PUBLIC_BASE_URL = 'https://7h.test';
process.env.FORCE_FILE_STORE = 'true';
delete process.env.DATABASE_URL;

const { db_, storeReady } = await import('../server/store.js');
await storeReady();

const express = (await import('express')).default;
const api = (await import('../server/app.js')).default;
const app = express();
app.use(api);
const server = http.createServer(app);
const port = await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const BASE = `http://127.0.0.1:${port}`;

const { calculateQuote, PRESSING_PLANTS, plantsForQuantity } = await import('../shared/pricing.js');
const { PLANT_PROFILES, marginCheck } = await import('../shared/plants.js');
const { COMPANY } = await import('../server/config.js');

const login = await fetch(`${BASE}/api/admin/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ passcode: '7HADMIN' }),
});
const { token } = await login.json();
const auth = { 'x-admin-token': token };

const post = (url, body, headers = {}) =>
  fetch(`${BASE}${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body ?? {}),
  });

// A real master goes through the chunked store, so the sheet can print a checksum.
const startUpload = await post('/api/uploads/start', { name: 'Naledi — master 24bit.wav', size: 64, kind: 'audio' });
const { upload } = await startUpload.json();
await fetch(`${BASE}/api/uploads/${upload.id}/chunk/0`, {
  method: 'PUT',
  headers: { 'content-type': 'application/octet-stream' },
  body: Buffer.alloc(64, 7),
});
const crypto = await import('node:crypto');
const digest = crypto.createHash('sha256').update(Buffer.alloc(64, 7)).digest('hex');
const completed = await (await post(`/api/uploads/${upload.id}/complete`, { sha256: digest })).json();

const placeOrder = async (overrides = {}) => {
  const response = await post('/api/orders', {
    client: {
      name: 'Naledi Okello',
      email: 'naledi@artist.test',
      phone: '+256772000111',
      country: 'Uganda',
      deliveryType: 'uganda',
      recipientName: 'Naledi Okello',
      deliveryAddress: 'Plot 12, Ntinda Road',
      deliveryCity: 'Kampala',
      deliveryRegion: 'Central',
      deliveryPostalCode: '00256',
      notes: 'Test press first.',
    },
    configuration: { quantity: 500, vinylTypeId: 'lp_colored', sleeveId: 'gatefold', plantId: 'mobineko' },
    payment: { method: 'mtn_momo', payerPhone: '+256772000111' },
    plantPreference: 'mobineko',
    uploads: { audio: [completed.upload.id], artwork: [] },
    artworkLink: 'https://drive.example.com/naledi-art.pdf',
    tracklist: 'A1 Riverbed 3:52\nA2 Kampala Nights 4:10\nB1 Okello 3:31',
    termsAccepted: true,
    ...overrides,
  });
  const payload = await response.json();
  return { status: response.status, order: payload.order, payload };
};

/* ------------------------------------------------------------------ */

console.log('\n▸ The panel matches what the plants publish');

const documented = [
  ['mobineko', 25],
  ['greenlakes', 100],
  ['seabass', 100],
  ['drdub', 1],
  ['gzmedia', 300],
  ['deepgrooves', 200],
];
for (const [id, minimum] of documented) {
  const plant = PRESSING_PLANTS.find((entry) => entry.id === id);
  check(`${plant?.name ?? id} carries its published minimum (${minimum})`, plant?.moq === minimum, String(plant?.moq));
  const profile = PLANT_PROFILES[id];
  check(`…and an intake profile`, Boolean(profile));
  check(`…with a channel and a source`, Boolean(profile?.channel && profile?.portal && profile?.sources?.length));
  check(`…agreeing with the rate card`, profile?.minimum === minimum, `${profile?.minimum}`);
}

check('a 50-unit run is not offered to Seabass', !plantsForQuantity(50).some((plant) => plant.id === 'seabass'));
check('a 250-unit run is not offered to GZ Media', !plantsForQuantity(250).some((plant) => plant.id === 'gzmedia'));
check('a 150-unit run is not offered to Deepgrooves', !plantsForQuantity(150).some((plant) => plant.id === 'deepgrooves'));
check('…but 300 units is', plantsForQuantity(300).some((plant) => plant.id === 'gzmedia'));

console.log('\n▸ Every plant returns a profile to the console');

const plantsResponse = await fetch(`${BASE}/api/admin/plants`, { headers: auth });
const plantList = await plantsResponse.json();
check('the endpoint is admin-only', (await fetch(`${BASE}/api/admin/plants`)).status === 401);
check('six plants come back', plantList.plants?.length === 6, String(plantList.plants?.length));
check(
  'each one names its intake form',
  plantList.plants.every((plant) => plant.profile?.channel && plant.profile?.portal),
);
check(
  'each one cites where the numbers came from',
  plantList.plants.every((plant) => plant.profile?.sources?.length > 0),
);
check(
  'the desk can see the questions a plant will ask',
  plantList.plants.every((plant) => plant.profile?.fields?.length >= 5),
);

console.log('\n▸ An order produces a sheet, per plant');

const placed = await placeOrder();
check('the order is accepted', placed.status === 201, JSON.stringify(placed.payload).slice(0, 160));
const orderId = placed.order?.id;

const sheetFor = async (plant) =>
  (await (await fetch(`${BASE}/api/admin/orders/${orderId}/plant-sheet?plant=${plant}`, { headers: auth })).json()).sheet;

const mobineko = await sheetFor('mobineko');
check('Mobineko is an online configurator', /configurator/i.test(mobineko.plant.channel), mobineko.plant.channel);
check('the catalogue number is the order reference', mobineko.order.catalogNumber === orderId);
check('the sheet carries the quantity and format', mobineko.fields.some((field) => field.value === '500'));
check('the master file is listed with its checksum', mobineko.files.some((file) => file.sha256 === digest));
check('and a download link', mobineko.files.some((file) => file.download?.includes('/api/files/')));
check('the sheet is copyable as plain text', /7H MUSIC GROUP/.test(mobineko.text) && /SPECIFICATION/.test(mobineko.text));
check(
  'the delivery address is on it',
  /Ntinda/.test(mobineko.text) && /Kampala/.test(mobineko.text),
);

const gz = await sheetFor('gzmedia');
check('GZ wants a catalogue-named folder', /folder/i.test(gz.fields.find((f) => f.key === 'catalogNumber').label));
check('…and the tracklist', gz.fields.some((field) => field.key === 'tracklist' && field.status === 'ready'));
check('…with our SHA-256 values on the sheet', /sha256/i.test(gz.text));
check('…and flags the master archive we do not build', gz.blockers.includes('Master packaging'), JSON.stringify(gz.blockers));
check(
  'a 500-unit run does not trip GZ’s minimum',
  !gz.warnings.some((warning) => /will not take anything under/.test(warning)),
);

const small = await placeOrder({
  configuration: { quantity: 100, vinylTypeId: 'seven_single', sleeveId: 'standard', plantId: 'seabass' },
  plantPreference: 'seabass',
});
const smallSheet = (
  await (await fetch(`${BASE}/api/admin/orders/${small.order.id}/plant-sheet?plant=gzmedia`, { headers: auth })).json()
).sheet;
check(
  'a 100-unit order against GZ warns instead of pretending',
  smallSheet.warnings.some((warning) => /will not take anything under 300/.test(warning)),
  JSON.stringify(smallSheet.warnings),
);

const gzSmall = await placeOrder({
  configuration: { quantity: 100, vinylTypeId: 'lp_standard', sleeveId: 'standard', plantId: 'greenlakes' },
  plantPreference: 'greenlakes',
  tracklist: '',
});
const noTracklist = (
  await (await fetch(`${BASE}/api/admin/orders/${gzSmall.order.id}/plant-sheet?plant=gzmedia`, { headers: auth })).json()
).sheet;
check(
  'without a tracklist, GZ is a blocker, not a blank',
  noTracklist.blockers.includes('Tracklist with individual track times'),
  JSON.stringify(noTracklist.blockers),
);
check('the sheet says what to collect', /COLLECT BEFORE ORDERING/.test(noTracklist.text));

const greenlakes = await sheetFor('greenlakes');
check(
  'Green Lakes wants a licence before pressing',
  greenlakes.blockers.includes('Mechanical licence / IP rights form'),
  JSON.stringify(greenlakes.blockers),
);

const deepgrooves = await sheetFor('deepgrooves');
check('Deepgrooves wants the invoice details', deepgrooves.fields.some((field) => field.key === 'invoiceDetails' && field.value));

const seabass = await sheetFor('seabass');
check('Seabass records the split-order rule', /separate orders/.test(seabass.fields.find((f) => f.key === 'splitNote').note ?? ''));

const drdub = await sheetFor('drdub');
check('Dr. Dub needs the running order', drdub.fields.some((field) => field.key === 'trackOrder'));

console.log('\n▸ The pricing guard: a plant quote above the client price');

const quote = calculateQuote({ quantity: 500, vinylTypeId: 'lp_colored', sleeveId: 'gatefold', plantId: 'mobineko', fxRate: 4360 });
check('the order is priced', quote.valid && quote.total > 0, String(quote.total));

const unverified = marginCheck(db_.data.orders.find((order) => order.id === orderId));
check('with nothing recorded, the margin is unverified — not "fine"', unverified.status === 'unverified', unverified.status);

const safe = await post(
  `/api/admin/orders/${orderId}/plant-quote`,
  { plantId: 'mobineko', costUsd: 1200, freightUsd: 300, dutiesUsd: 100, note: "Mobineko PDF quote" },
  auth,
);
const safeBody = await safe.json();
check('a quote under the client price is safe', safeBody.margin?.status === 'safe', JSON.stringify(safeBody.margin));
check('…and the margin is the difference', Math.abs(safeBody.margin.marginUsd - (quote.total - 1600)) < 0.02, String(safeBody.margin.marginUsd));

const loss = await post(
  `/api/admin/orders/${orderId}/plant-quote`,
  { plantId: 'mobineko', costUsd: quote.total + 500, freightUsd: 250, dutiesUsd: 0, note: 'Plant raised its rates' },
  auth,
);
const lossBody = await loss.json();
check('a quote above the client price is a loss', lossBody.margin?.status === 'loss', JSON.stringify(lossBody.margin));
check('…with the shortfall spelled out', /out of pocket/.test(lossBody.margin.detail), lossBody.margin.detail);
check('…and the order record carries it', lossBody.order?.plantMargin?.lossRisk === true);

const forwardBlocked = await post(`/api/admin/orders/${orderId}/forward`, { plantId: 'mobineko' }, auth);
const forwardBody = await forwardBlocked.json();
check('forwarding a loss-making order is refused', forwardBlocked.status === 409, String(forwardBlocked.status));
check('…with its own code, not the deposit one', forwardBody.code === 'loss_risk', forwardBody.code);

const acknowledged = await post(
  `/api/admin/orders/${orderId}/plant-quote`,
  {
    plantId: 'mobineko',
    costUsd: quote.total + 500,
    freightUsd: 250,
    dutiesUsd: 0,
    note: 'Client is a long-standing account',
    acknowledgeLoss: true,
  },
  auth,
);
const acknowledgedBody = await acknowledged.json();
check('acknowledging the loss is recorded, not hidden', acknowledgedBody.order?.plantQuote?.acknowledgedLoss === true);
check('…and the console still calls it a loss', acknowledgedBody.margin?.lossRisk === true);

const afterAck = await post(`/api/admin/orders/${orderId}/forward`, { plantId: 'mobineko' }, auth);
const afterAckBody = await afterAck.json();
check(
  'the deposit gate still refuses the forward underneath',
  afterAck.status === 409 && afterAckBody.code === 'deposit_required',
  `${afterAck.status} ${afterAckBody.code}`,
);

const overview = await (await fetch(`${BASE}/api/admin/overview`, { headers: auth })).json();
check('the console counts acknowledged losses separately', typeof overview.summary?.lossRisk === 'number', String(overview.summary?.lossRisk));
check(
  'an acknowledged loss stops counting as an open risk',
  overview.summary?.lossRisk === 0,
  String(overview.summary?.lossRisk),
);

console.log('\n▸ The company TIN reaches the plant sheets and the invoice');

check('the TIN is configured', COMPANY.tin === '1042994723', COMPANY.tin);
check(
  'Mobineko’s VAT field is pre-filled with it',
  mobineko.fields.some((field) => field.key === 'vat' && field.value === '1042994723'),
  JSON.stringify(mobineko.fields.find((field) => field.key === 'vat')),
);
const invoiceHtml = await (await fetch(`${BASE}/api/orders/${orderId}/invoice`)).text();
check('the invoice shows the TIN', invoiceHtml.includes('1042994723'));
check('…twice: letterhead and footer', invoiceHtml.split('1042994723').length - 1 >= 2);
check('…and the tracklist', invoiceHtml.includes('Kampala Nights'));

console.log('\n▸ The console can fix the tracklist after the fact');

const patched = await fetch(`${BASE}/api/admin/orders/${gzSmall.order.id}`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json', ...auth },
  body: JSON.stringify({ tracklist: 'A1 One 3:00\nB1 Two 3:20' }),
});
check('the desk can add a tracklist', patched.status === 200, String(patched.status));
const afterPatch = (
  await (await fetch(`${BASE}/api/admin/orders/${gzSmall.order.id}/plant-sheet?plant=gzmedia`, { headers: auth })).json()
).sheet;
check(
  '…and the sheet stops blocking on it',
  !afterPatch.blockers.includes('Tracklist with individual track times'),
  JSON.stringify(afterPatch.blockers),
);

/* ------------------------------------------------------------------ */

server.close();
await db_.close();
fs.rmSync(dataDir, { recursive: true, force: true });

console.log('');
if (failures.length > 0) {
  console.error(`${passed}/${passed + failures.length} checks passed`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`${passed}/${passed} checks passed`);
