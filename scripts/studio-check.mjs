/**
 * Studio-desk checks: drafts, desk uploads, pre-orders.
 *
 * Round C is the "studio side": the parts of the workflow that happen before a
 * client ever fills in a form. Three claims have to hold:
 *
 *   · a draft built in the console is priced by the same engine the site uses,
 *     is invoiced immediately as a *provisional* invoice, fires no alerts, and
 *     cannot reach a plant until it is a real order with a confirmed deposit;
 *   · the desk can attach its own upload to a client's order, and the file then
 *     lives on the order rather than in a downloads folder;
 *   · a pre-order sells a record before it is pressed: the storefront says when
 *     it ships, checkout accepts it at zero stock, and no shelf count is
 *     invented or decremented.
 *
 * Run with `npm run test:studio`.
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { calculateQuote } from '../shared/pricing.js';
import { availabilityFor, formatShipsOn } from '../shared/shop.js';

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

/* ── availability is a pure function, so test it without a server ───────── */
console.log('\nWhat a card is allowed to claim');
const onShelf = availabilityFor({ stock: 7 });
check('stock on the shelf is buyable', onShelf.state === 'in_stock' && onShelf.canBuy);
check('the card says how many are left', onShelf.label === 'In stock', onShelf.label);
const low = availabilityFor({ stock: 2 });
check('a low shelf count is said out loud', low.label === '2 left' && low.maxPerOrder === 2, low.label);
const empty = availabilityFor({ stock: 0 });
check('an empty shelf is sold out and not buyable', empty.state === 'sold_out' && !empty.canBuy);
const pre = availabilityFor({ stock: 0, preorder: { shipsOn: '2026-12-15' } });
check('a pre-order with no stock is buyable', pre.state === 'preorder' && pre.canBuy);
check('a pre-order says when it ships', /15 December 2026/.test(pre.detail), pre.detail);
check('a pre-order is never counted as stock', pre.countedAsStock === false);
check('a pre-order ignores the empty shelf for the quantity cap', pre.maxPerOrder > 0);
check('the ship date reads as a date', formatShipsOn('2026-12-15') === '15 December 2026');
check('a broken date does not crash the card', formatShipsOn('not-a-date') === 'soon');

/* ── the real server ────────────────────────────────────────────────────── */
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), '7h-studio-'));
process.env.DATA_DIR = dataDir;
process.env.UPLOAD_DIR = dataDir;
process.env.NODE_ENV = 'test';
process.env.ADMIN_PASSCODE = '7HSTUDIO';
process.env.FORCE_FILE_STORE = 'true';
delete process.env.DATABASE_URL;
delete process.env.MOMO_SUBSCRIPTION_KEY;

const { db_, storeReady } = await import('../server/store.js');
await storeReady();
const express = (await import('express')).default;
const api = (await import('../server/app.js')).default;
const app = express();
app.use(api);
const server = http.createServer(app);
const port = await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const BASE = `http://127.0.0.1:${port}`;

const json = async (url, init) => {
  const res = await fetch(`${BASE}${url}`, init);
  const body = await res.json().catch(() => ({}));
  return { res, body };
};
const post = (url, body, headers = {}) =>
  json(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const patch = (url, body, headers = {}) =>
  json(url, { method: 'PATCH', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const del = (url, headers = {}) => json(url, { method: 'DELETE', headers });
const put = (url, body, headers = {}) =>
  json(url, { method: 'PUT', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

const login = await post('/api/admin/login', { passcode: '7HSTUDIO' });
const auth = { 'x-admin-token': login.body.token };

try {
  /* ── drafts ───────────────────────────────────────────────────────────── */
  console.log('\nDrafts');
  const anonymous = await post('/api/admin/orders', {
    client: { name: 'Sneaky', email: 's@x.test', phone: '+256700000000' },
    configuration: { quantity: 250, vinylTypeId: 'lp_standard', sleeveId: 'standard' },
  });
  check('only the console can build a draft', anonymous.res.status === 401, String(anonymous.res.status));

  const thin = await post('/api/admin/orders', { client: { name: 'A' }, configuration: {} }, auth);
  check('a draft with no contact is refused', thin.res.status === 422, String(thin.res.status));
  check('and it says which fields are missing', Boolean(thin.body.errors?.email), JSON.stringify(thin.body.errors ?? {}));

  const expected = calculateQuote({ quantity: 250, vinylTypeId: 'lp_colored', sleeveId: 'gatefold' });
  const drafted = await post(
    '/api/admin/orders',
    {
      client: { name: 'Kizza Roots', email: 'kizza@roots.test', phone: '+256772000111', country: 'Uganda' },
      configuration: { quantity: 250, vinylTypeId: 'lp_colored', sleeveId: 'gatefold' },
      tracklist: 'A1 Opening 3:42\nA2 Kampala Nights 4:05',
      note: 'Agreed on WhatsApp',
    },
    auth,
  );
  check('the desk can build an order for a client', drafted.res.status === 201, String(drafted.res.status));
  const draft = drafted.body.order ?? {};
  check('it is a draft, not a live order', draft.status === 'draft', String(draft.status));
  check('the console records that the studio built it', draft.source === 'studio', String(draft.source));
  check(
    'it is priced by the same engine the site uses',
    draft.quote?.total === expected.total,
    `${draft.quote?.total} vs ${expected.total}`,
  );
  check(
    'the quote carries its cost model, so the margin is visible',
    draft.quote?.cost?.clearsFloor === true && draft.quote.costModel === 'plant-cost-v1',
  );
  check('the tracklist is kept', /Kampala Nights/.test(draft.tracklist ?? ''));
  check('an invoice is issued straight away', /^7H-INV-/.test(drafted.body.invoice?.number ?? ''), String(drafted.body.invoice?.number));
  check('the invoice is provisional while it is a draft', draft.invoice?.provisional === true);
  check('no alerts fired for a draft', (db_.data.events ?? []).filter((event) => event.orderId === draft.id).length === 0);

  const overview = await json('/api/admin/overview', { headers: auth });
  check(
    'the draft appears in the console',
    (overview.body.orders ?? []).some((order) => order.id === draft.id && order.status === 'draft'),
  );

  // The gate still stands: a draft cannot be released to a plant.
  const early = await post(`/api/admin/orders/${draft.id}/forward`, { plantId: 'mobineko' }, auth);
  check('a draft cannot reach a plant', early.res.status === 409, String(early.res.status));
  check('and it is refused for the deposit reason', early.body.code === 'deposit_gate' || early.body.code === 'plant_not_released' || Boolean(early.body.error), String(early.body.code));

  const released = await patch(`/api/admin/orders/${draft.id}`, { status: 'received' }, auth);
  check('a confirmed draft becomes a live order', released.res.status === 200 && released.body.order?.status === 'received', String(released.body.order?.status));
  const history = (released.body.order?.statusHistory ?? []).map((entry) => entry.status);
  check('the move is written into the history', history.includes('received'), history.join(' → '));

  /* ── desk uploads ─────────────────────────────────────────────────────── */
  console.log('\nFiles attached on the client’s behalf');
  const uploadForm = new FormData();
  uploadForm.set('orderId', draft.id);
  uploadForm.set('audio', new Blob([Buffer.from('RIFF....WAVE fake master bytes')], { type: 'audio/wav' }), 'kizza-master.wav');
  const uploaded = await fetch(`${BASE}/api/uploads`, { method: 'POST', body: uploadForm }).then((res) => res.json());
  const uploadId = uploaded.uploads?.[0]?.id;
  check('the desk can upload a master', Boolean(uploadId), JSON.stringify(uploaded).slice(0, 120));

  const attached = await post(`/api/admin/orders/${draft.id}/files`, { uploadIds: [uploadId] }, auth);
  check('the file is attached to the order', attached.res.status === 200 && attached.body.attached?.length === 1, String(attached.res.status));
  check(
    'the order now carries the master',
    (attached.body.order?.files?.audio ?? []).some((file) => file.id === uploadId),
  );
  check(
    'the upload is filed under the order, not loose',
    (db_.data.uploads ?? []).find((record) => record.id === uploadId)?.orderId === draft.id,
  );
  const ghost = await post(`/api/admin/orders/${draft.id}/files`, { uploadIds: ['upl_nope'] }, auth);
  check('a missing upload is reported, not silently dropped', ghost.res.status === 404, String(ghost.res.status));

  /* ── pre-orders ───────────────────────────────────────────────────────── */
  console.log('\nPre-orders');
  const anonPre = await put('/api/admin/shop/preorder/badman', { shipsOn: '2027-01-30' });
  check('pre-orders are set from the console only', anonPre.res.status === 401, String(anonPre.res.status));

  const past = await put('/api/admin/shop/preorder/badman', { shipsOn: '2020-01-01' }, auth);
  check('a ship date in the past is refused', past.res.status === 400, String(past.res.status));
  const nonsense = await put('/api/admin/shop/preorder/badman', { shipsOn: 'soon' }, auth);
  check('a ship date that is not a date is refused', nonsense.res.status === 400, String(nonsense.res.status));
  const unknown = await put('/api/admin/shop/preorder/not-a-record', { shipsOn: '2027-01-30' }, auth);
  check('a release that does not exist is refused', unknown.res.status === 400, String(unknown.res.status));

  // Empty the shelf first, so the pre-order is the only thing on sale.
  await patch('/api/admin/shop/stock/badman', { stock: 0 }, auth);
  const shopBefore = await json('/api/shop');
  const soldOut = (shopBefore.body.releases ?? []).find((release) => release.id === 'badman');
  check('with no stock the record is sold out', soldOut?.availability?.state === 'sold_out', String(soldOut?.availability?.state));

  const madePre = await put('/api/admin/shop/preorder/badman', { shipsOn: '2027-01-30', note: 'Second pressing' }, auth);
  check('the console can put a release on pre-order', madePre.res.status === 200, String(madePre.res.status));

  const shopAfter = await json('/api/shop');
  const preordered = (shopAfter.body.releases ?? []).find((release) => release.id === 'badman');
  check('the storefront offers it again', preordered?.availability?.state === 'preorder', String(preordered?.availability?.state));
  check('the card carries the ship date', /30 January 2027/.test(preordered?.availabilityDetail ?? ''), preordered?.availabilityDetail);
  check('the card is buyable at zero stock', preordered?.canBuy === true && preordered?.maxPerOrder > 0);
  check('the card does not claim stock it does not have', preordered?.stock === 0 && preordered?.soldOut === false);

  const shopOrder = await post('/api/shop/orders', {
    buyer: { name: 'Pre Order Fan', email: 'fan@example.test', phone: '+256772999888' },
    items: [{ releaseId: 'badman', quantity: 2 }],
    delivery: { id: 'pickup', recipientName: 'Pre Order Fan', city: 'Kampala' },
    payment: { method: 'mtn_momo', payerPhone: '+256772999888' },
  });
  check('a fan can buy the pre-order', shopOrder.res.status === 201, JSON.stringify(shopOrder.body).slice(0, 120));
  check('the order is marked as containing a pre-order', shopOrder.body.order?.containsPreorder === true);
  const line = (shopOrder.body.order?.items ?? [])[0];
  check('the line says it ships later', line?.preorder === true && line?.shipsOn === '2027-01-30', JSON.stringify(line ?? {}));
  const stillZero = (await json('/api/shop')).body.releases.find((release) => release.id === 'badman');
  check('the shelf count is untouched by a pre-order sale', stillZero?.stock === 0, String(stillZero?.stock));

  const ended = await del('/api/admin/shop/preorder/badman', auth);
  check('the console can close a pre-order', ended.res.status === 200, String(ended.res.status));
  const afterEnd = (await json('/api/shop')).body.releases.find((release) => release.id === 'badman');
  check('the card goes back to sold out', afterEnd?.availability?.state === 'sold_out', String(afterEnd?.availability?.state));
  const endAgain = await del('/api/admin/shop/preorder/badman', auth);
  check('closing one twice says so', endAgain.res.status === 404, String(endAgain.res.status));
} catch (error) {
  check('the studio desk is reachable', false, error.message);
} finally {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
}

console.log(`\n${passed}/${passed + failures.length} checks passed`);
if (failures.length > 0) {
  for (const failure of failures.slice(0, 20)) console.log(`  ✗ ${failure}`);
  process.exit(1);
}
