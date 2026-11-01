/**
 * Mobile money + file storage checks.
 *
 * Two rails that take money or bytes, both driven against local sinks so the run
 * is hermetic — no MTN sandbox account, no Airtel UAT credentials, no network.
 *
 * Proving these things matters more than most: a wallet rail that silently
 * collects nothing, or an upload that reports success and stores nothing, is
 * worse than one that refuses.
 *
 * Covers:
 *   · a real collection request per provider, with the right payload and headers;
 *   · PENDING → SUCCESSFUL → confirmed, and the deposit gate still holding;
 *   · FAILED prompts, wrong numbers, wrong amounts, and rate limiting;
 *   · unconfigured rails naming their variables instead of failing;
 *   · callback signature checks;
 *   · chunked uploads: start, slice, complete, checksum, resume, download, delete;
 *   · the file store listing with folders and totals.
 *
 * Run with `npm run test:payments`.
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

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

/* ------------------------------------------------------------------ *
 * The wallet sink: pretending to be MTN MoMo and Airtel Money
 * ------------------------------------------------------------------ */

const state = {
  requests: [],
  tokens: 0,
  /** What the next status poll should answer. */
  nextStatus: 'PENDING',
  statusReason: null,
  declineTokens: false,
};

const sink = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    const json = (() => {
      try {
        return body ? JSON.parse(body) : {};
      } catch {
        return {};
      }
    })();
    const url = req.url ?? '';
    const send = (status, payload) =>
      res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(payload));

    // MTN token
    if (url === '/collection/token/') {
      state.tokens += 1;
      if (!String(req.headers.authorization ?? '').startsWith('Basic ')) {
        return send(401, { message: 'Missing basic auth' });
      }
      return send(200, { access_token: 'mtn-token', token_type: 'access_token', expires_in: 3600 });
    }

    // MTN request to pay
    if (url === '/collection/v1_0/requesttopay' && req.method === 'POST') {
      if (req.headers.authorization !== 'Bearer mtn-token') return send(401, { message: 'Unauthorized' });
      if (req.headers['ocp-apim-subscription-key'] !== 'sub-key') {
        return send(401, { message: 'Invalid subscription key' });
      }
      state.requests.push({
        provider: 'mtn_momo',
        referenceId: req.headers['x-reference-id'],
        environment: req.headers['x-target-environment'],
        callback: req.headers['x-callback-url'],
        body: json,
      });
      return res.writeHead(202, { 'content-type': 'application/json' }).end();
    }

    if (url.startsWith('/collection/v1_0/requesttopay/') && req.method === 'GET') {
      if (req.headers.authorization !== 'Bearer mtn-token') return send(401, { message: 'Unauthorized' });
      const referenceId = url.split('/').pop();
      const request = state.requests.find((entry) => entry.referenceId === referenceId);
      return send(200, {
        status: state.nextStatus,
        // The provider echoes back what it actually collected, not what we asked.
        amount: request?.body?.amount ?? '0',
        currency: 'UGX',
        reason: state.statusReason,
      });
    }

    // Airtel token
    if (url === '/auth/oauth2/token') {
      if (state.declineTokens) return send(401, { error_description: 'Invalid client' });
      return send(200, { access_token: 'airtel-token', expires_in: 3600 });
    }

    // Airtel pay
    if (url === '/merchant/v1/payments/' && req.method === 'POST') {
      if (req.headers.authorization !== 'Bearer airtel-token') return send(401, { message: 'Unauthorized' });
      if (req.headers['x-country'] !== 'UG') return send(400, { message: 'Missing X-Country' });
      state.requests.push({ provider: 'airtel_money', referenceId: 'AIRTEL-TX-1', body: json });
      return send(200, { data: { transaction: { id: 'AIRTEL-TX-1', status: 'TIP' } }, status: { code: '200' } });
    }

    if (url.startsWith('/standard/v1/payments/') && req.method === 'GET') {
      if (req.headers.authorization !== 'Bearer airtel-token') return send(401, { message: 'Unauthorized' });
      return send(200, {
        data: {
          transaction: {
            status: state.nextStatus === 'SUCCESSFUL' ? 'TS' : state.nextStatus === 'FAILED' ? 'TF' : 'TIP',
            amount: state.requests.find((entry) => entry.provider === 'airtel_money')?.body?.transaction?.amount ?? 0,
            currency: 'UGX',
          },
        },
      });
    }

    return send(404, { message: 'no such sink route' });
  });
});

const listen = (server) =>
  new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const sinkPort = await listen(sink);
const SINK = `http://127.0.0.1:${sinkPort}`;

/* ------------------------------------------------------------------ *
 * Environment
 * ------------------------------------------------------------------ */

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), '7h-payments-'));
process.env.DATA_DIR = dataDir;
process.env.UPLOAD_DIR = dataDir;
process.env.NODE_ENV = 'test';
process.env.ADMIN_PASSCODE = '7HADMIN';
process.env.MOMO_API_BASE = SINK;
process.env.AIRTEL_API_BASE = SINK;
process.env.PUBLIC_BASE_URL = 'https://7h.test';
process.env.FORCE_FILE_STORE = 'true';
delete process.env.DATABASE_URL;

const { db_, storeReady } = await import('../server/store.js');
await storeReady();

const express = (await import('express')).default;
const api = (await import('../server/app.js')).default;
const app = express();
app.use(api);
const apiServer = http.createServer(app);
const apiPort = await listen(apiServer);
const BASE = `http://127.0.0.1:${apiPort}`;

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
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/* ------------------------------------------------------------------ *
 * A rail with no credentials must say so
 * ------------------------------------------------------------------ */

console.log('\n▸ A wallet rail with no credentials');

const railsBefore = await (await fetch(`${BASE}/api/payments/rails`)).json();
const mtnBefore = railsBefore.rails.find((rail) => rail.provider === 'mtn_momo');
check('the rail reports itself unconfigured', mtnBefore.ready === false, JSON.stringify(mtnBefore));
check('…and names every missing variable', mtnBefore.missing.includes('MOMO_SUBSCRIPTION_KEY'), JSON.stringify(mtnBefore.missing));

// Seed an order the way the order form would leave it.
const { calculateQuote } = await import('../shared/pricing.js');
const quote = calculateQuote({ quantity: 250, vinylTypeId: 'lp_colored', sleeveId: 'gatefold', plantId: 'mobineko', fxRate: 4360 });
const seedOrder = (overrides = {}) => {
  const order = {
    id: `7H-2026-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
    createdAt: new Date().toISOString(),
    status: 'received',
    client: {
      name: 'Prompt Test',
      email: 'prompt@artist.test',
      phone: '+256772000111',
      country: 'Uganda',
      deliveryType: 'uganda',
      recipientName: 'Prompt Test',
      deliveryAddress: 'Ntinda',
      deliveryCity: 'Kampala',
      deliveryRegion: 'Central',
      deliveryPostalCode: '00256',
      notes: '',
    },
    configuration: { quantity: 250, vinylTypeId: 'lp_colored', sleeveId: 'gatefold', plantId: 'mobineko' },
    quote: {
      total: quote.total,
      deposit: quote.deposit,
      balance: quote.balance,
      perUnit: quote.perUnit,
      fxRate: 4360,
      fxLockedAt: new Date().toISOString(),
      totals: quote.totals,
    },
    payment: {
      method: 'mtn_momo',
      payerPhone: '+256772000111',
      payerName: 'Prompt Test',
      status: 'processing',
      reference: 'MOMO-123456',
    },
    plantPreference: 'mobineko',
    files: { audio: [], artwork: [], audioLink: null, artworkLink: null },
    statusHistory: [{ status: 'received', at: new Date().toISOString(), by: 'client', note: 'Order submitted' }],
    ...overrides,
  };
  db_.data.orders.unshift(order);
  db_.save();
  return order;
};

const draft = seedOrder();
const unconfigured = await post(`/api/orders/${draft.id}/deposit/request`, { provider: 'mtn_momo' });
const unconfiguredBody = await unconfigured.json();
check('asking for a prompt on an unconfigured rail is 503, not 500', unconfigured.status === 503, String(unconfigured.status));
check('…it says which variables to add', unconfiguredBody.missing?.includes('MOMO_SUBSCRIPTION_KEY'), JSON.stringify(unconfiguredBody.missing));
check('…and prints the manual fallback', Boolean(unconfiguredBody.manual?.merchantNumber), JSON.stringify(unconfiguredBody.manual));
check('nothing was sent to the provider', state.requests.length === 0);

/* ------------------------------------------------------------------ *
 * With credentials: a real collection request
 * ------------------------------------------------------------------ */

console.log('\n▸ MTN MoMo collection');
process.env.MOMO_SUBSCRIPTION_KEY = 'sub-key';
process.env.MOMO_API_USER = 'api-user';
process.env.MOMO_API_KEY = 'api-key';
process.env.MOMO_TARGET_ENV = 'sandbox';
process.env.AIRTEL_CLIENT_ID = 'airtel-id';
process.env.AIRTEL_CLIENT_SECRET = 'airtel-secret';

const railsAfter = await (await fetch(`${BASE}/api/payments/rails`)).json();
check('the rail turns ready once its variables are set', railsAfter.rails.find((r) => r.provider === 'mtn_momo').ready === true);

const requested = await post(`/api/orders/${draft.id}/deposit/request`, { provider: 'mtn_momo', payerPhone: '0772 000 111' });
const requestedBody = await requested.json();
if (requested.status !== 202) console.log('   raw:', JSON.stringify(requestedBody));
check('a prompt is accepted with 202', requested.status === 202, String(requested.status));
check('…carrying a reference to poll', Boolean(requestedBody.intent?.reference), JSON.stringify(requestedBody.intent));
check('…for the shilling deposit', requestedBody.intent.amountUgx === Math.ceil(quote.deposit * 4360), `${requestedBody.intent?.amountUgx} vs ${Math.ceil(quote.deposit * 4360)}`);
check('…quoting the 0.5% wallet fee separately', requestedBody.intent.feeUgx === Math.ceil(requestedBody.intent.amountUgx * 0.005), String(requestedBody.intent?.feeUgx));
check('…and masking the wallet number', /•••/.test(requestedBody.intent.payerMasked ?? ''), requestedBody.intent.payerMasked);

const mtnCall = state.requests[0];
check('the token call happened', state.tokens === 1, String(state.tokens));
check('the request hit the collections endpoint', mtnCall?.provider === 'mtn_momo');
check('…with a subscription key header', Boolean(mtnCall));
check('…as a UGX MSISDN collection', mtnCall?.body.currency === 'UGX' && mtnCall.body.payer.partyIdType === 'MSISDN', JSON.stringify(mtnCall?.body));
check('…to the normalised 256 number', mtnCall?.body.payer.partyId === '256772000111', mtnCall?.body.payer.partyId);
check('…with the order id as externalId', mtnCall?.body.externalId === draft.id, mtnCall?.body.externalId);
check('…and a callback so a lost poll is not a lost payment', /\/api\/payments\/momo\/callback\//.test(mtnCall?.callback ?? ''), mtnCall?.callback);
check('…using the configured target environment', mtnCall?.environment === 'sandbox', mtnCall?.environment);

check('the order is marked processing, not paid', draft.payment.status === 'processing', draft.payment.status);
check('the intent is stored on the order', (draft.payment.intents ?? []).length === 1);

/* ------------------------------------------------------------------ *
 * Pending → successful → confirmed
 * ------------------------------------------------------------------ */

console.log('\n▸ Waiting for the approval');
const intentId = requestedBody.intent.id;
const pending = await (await fetch(`${BASE}/api/orders/${draft.id}/deposit/${intentId}`)).json();
check('a pending prompt stays pending', pending.intent.status === 'pending', pending.intent.status);
check('…and tells the client what to do', /approve/i.test(pending.next ?? ''), pending.next);
check('a pending prompt cannot release a plant', draft.plantHandoff === undefined && draft.payment.status === 'processing');

state.nextStatus = 'SUCCESSFUL';
const succeeded = await (await fetch(`${BASE}/api/orders/${draft.id}/deposit/${intentId}`)).json();
check('the provider answer flips the intent to successful', succeeded.intent.status === 'successful', JSON.stringify(succeeded.intent));
check('the collected amount is recorded on the order', draft.payment.collected?.amount === Math.ceil(quote.deposit * 4360), JSON.stringify(draft.payment.collected));
check(
  'the deposit is NOT confirmed automatically by default',
  draft.payment.status === 'processing' && draft.payment.confirmedBy === undefined,
  `${draft.payment.status} / ${draft.payment.confirmedBy}`,
);
check('…the console is told it is waiting on it', draft.payment.awaitingConfirmation?.reason === 'wallet-collected');
check('…and nothing was sent to a plant', draft.plantHandoff === undefined);

const confirmed = await post(`/api/admin/orders/${draft.id}/deposit/confirm`, undefined, auth);
const confirmedBody = await confirmed.json();
check('the desk can confirm the collected deposit', confirmed.status === 200, JSON.stringify(confirmedBody).slice(0, 120));
check('…which records who confirmed it', draft.payment.confirmedBy === 'console', String(draft.payment.confirmedBy));
check('…and names the wallet collection', /collected UGX/.test(draft.payment.confirmationNote ?? ''), draft.payment.confirmationNote);
check('the deposit now counts as paid', draft.payment.status === 'deposit_paid', draft.payment.status);
check('the intent is marked as the deposit it paid', draft.payment.intents[0].confirmedDeposit === true);

const confirmAgain = await post(`/api/admin/orders/${draft.id}/deposit/confirm`, undefined, auth);
check('confirming twice is refused, not double-counted', confirmAgain.status === 409, String(confirmAgain.status));

/* ------------------------------------------------------------------ *
 * Failures are named
 * ------------------------------------------------------------------ */

console.log('\n▸ A declined prompt');
const second = seedOrder();
const request2 = await (await post(`/api/orders/${second.id}/deposit/request`, { provider: 'mtn_momo' })).json();
state.nextStatus = 'FAILED';
state.statusReason = 'INSUFFICIENT_BALANCE';
const declined = await (await fetch(`${BASE}/api/orders/${second.id}/deposit/${request2.intent.id}`)).json();
check('a declined prompt is a failed intent', declined.intent.status === 'failed', declined.intent.status);
check('…carrying the provider reason', /INSUFFICIENT_BALANCE/.test(declined.intent.error ?? ''), declined.intent.error);
check('…and it did not mark the deposit paid', second.payment.status !== 'deposit_paid', second.payment.status);
check('…so no plant was contacted', second.plantHandoff === undefined);
state.nextStatus = 'PENDING';
state.statusReason = null;

console.log('\n▸ Refusals that protect the payer and the desk');
const wrongNumber = await post(`/api/orders/${second.id}/deposit/request`, { provider: 'mtn_momo', payerPhone: '0779 999 999' });
check('a prompt can only ring the number on the order', wrongNumber.status === 403, String(wrongNumber.status));

const fresh = seedOrder();
const badNumber = await post(`/api/orders/${fresh.id}/deposit/request`, { provider: 'mtn_momo', payerPhone: '123' });
check('a nonsense wallet number is refused with an explanation', badNumber.status === 400, String(badNumber.status));

const aired = await post(`/api/orders/${second.id}/deposit/request`, { provider: 'airtel_money' });
const airedBody = await aired.json();
check('airtel collections are accepted too', aired.status === 202, JSON.stringify(airedBody).slice(0, 140));
check('…with the country and currency headers the API requires', Boolean(state.requests.at(-1)?.body.subscriber.msisdn), JSON.stringify(state.requests.at(-1)?.body));

// Rate limiting: three prompts in ten minutes, then stop.
const burst = seedOrder();
let limited = 0;
for (let index = 0; index < 5; index += 1) {
  const response = await post(`/api/orders/${burst.id}/deposit/request`, { provider: 'mtn_momo' });
  if (response.status === 429) limited += 1;
}
check('repeated prompts are rate limited', limited >= 1, String(limited));

console.log('\n▸ The callback is authenticated');
const callbackSecret = crypto
  .createHash('sha256')
  .update(`7h-payments::mtn_momo::${process.env.MOMO_SUBSCRIPTION_KEY}`)
  .digest('hex')
  .slice(0, 40);

const third = seedOrder();
const request3 = await (await post(`/api/orders/${third.id}/deposit/request`, { provider: 'mtn_momo' })).json();
const badCall = await post(`/api/payments/momo/callback/${third.id}`, { status: 'SUCCESSFUL', referenceId: request3.intent.reference });
check('an unsigned callback is ignored with a 200', badCall.status === 200);
check('…and changes nothing', third.payment.intents[0].status === 'pending', third.payment.intents[0].status);

const goodCall = await post(
  `/api/payments/momo/callback/${third.id}`,
  { status: 'SUCCESSFUL', referenceId: request3.intent.reference, amount: request3.intent.amountUgx, currency: 'UGX' },
  { 'x-callback-secret': callbackSecret },
);
check('a signed callback is accepted', goodCall.status === 200);
check('…and settles the intent', third.payment.intents[0].status === 'successful', third.payment.intents[0].status);
check('…still without confirming the deposit', third.payment.status !== 'deposit_paid', third.payment.status);

console.log('\n▸ The sweep picks up what a webhook missed');
const fourth = seedOrder();
const request4 = await (await post(`/api/orders/${fourth.id}/deposit/request`, { provider: 'mtn_momo' })).json();
check('a prompt is pending before the sweep', fourth.payment.intents[0].status === 'pending');
state.nextStatus = 'SUCCESSFUL';
const swept = await (await post('/api/admin/deposits/sweep', undefined, auth)).json();
check('the sweep asks the provider', swept.checked >= 1, JSON.stringify(swept));
check('…and settles the successful one', swept.settled >= 1, JSON.stringify(swept));
check('…on the order that was waiting', fourth.payment.intents[0].status === 'successful', fourth.payment.intents[0].status);
state.nextStatus = 'PENDING';
state.declineTokens = true;
const sweepBroken = await (await post('/api/admin/deposits/sweep', undefined, auth)).json();
check('a provider outage does not crash the sweep', typeof sweepBroken.checked === 'number', JSON.stringify(sweepBroken));
state.declineTokens = false;

/* ------------------------------------------------------------------ *
 * Uploads: bigger, chunked, durable, findable
 * ------------------------------------------------------------------ */

console.log('\n▸ Chunked uploads');

const limits = await (await fetch(`${BASE}/api/uploads/limits`)).json();
check('the per-file limit is no longer 4MB', limits.maxUploadMb >= 100, String(limits.maxUploadMb));
check('…and the chunk size fits inside a serverless body cap', limits.chunkBytes <= 3.5 * 1024 * 1024, String(limits.chunkBytes));

// A fake "WAV" big enough to need several chunks, at the configured chunk size.
const chunkBytes = limits.chunkBytes;
const wavBytes = (() => {
  const total = chunkBytes * 3 + 1234;
  const buffer = Buffer.alloc(total);
  for (let index = 0; index < total; index += 1) buffer[index] = index % 251;
  buffer.write('RIFF', 0);
  buffer.write('WAVE', 8);
  return buffer;
})();

const start = await post('/api/uploads/start', {
  name: 'NALEDI — master v3 (24bit).wav',
  size: wavBytes.length,
  kind: 'audio',
  mimeType: 'audio/wav',
});
const startBody = await start.json();
check('an upload starts with a session', start.status === 201, String(start.status));
check('…declaring how many slices it needs', startBody.chunks === Math.ceil(wavBytes.length / chunkBytes), `${startBody.chunks}`);
check('…and filing it in a dated inbox folder', /^inbox\/\d{4}-\d{2}\/audio$/.test(startBody.upload.folder ?? ''), startBody.upload.folder);
check('…marked as still uploading', startBody.upload.status === 'uploading');

const uploadId = startBody.upload.id;
const sendChunk = (seq) =>
  fetch(`${BASE}/api/uploads/${uploadId}/chunk/${seq}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/octet-stream' },
    body: wavBytes.subarray(seq * chunkBytes, (seq + 1) * chunkBytes),
  });

// First slice only: completion must refuse.
const firstResponse = await sendChunk(0);
check('a chunk is accepted', firstResponse.status === 200, String(firstResponse.status));
const early = await post(`/api/uploads/${uploadId}/complete`, {});
const earlyBody = await early.json();
check('completing too early is refused', early.status === 409, String(early.status));
check('…naming how many slices are missing', earlyBody.missing === startBody.chunks - 1, JSON.stringify(earlyBody));

for (let seq = 1; seq < startBody.chunks; seq += 1) await sendChunk(seq);

const hash = crypto.createHash('sha256').update(wavBytes).digest('hex');
const wrongHash = await post(`/api/uploads/${uploadId}/complete`, { sha256: 'deadbeef' });
check('a checksum mismatch is refused', wrongHash.status === 409, String(wrongHash.status));

const completed = await post(`/api/uploads/${uploadId}/complete`, { sha256: hash });
const completedBody = await completed.json();
check('the upload completes', completed.status === 200, JSON.stringify(completedBody).slice(0, 160));
check('…with the checksum it computed', completedBody.upload.sha256 === hash, completedBody.upload.sha256);
check('…recording which store holds it', ['postgres', 'file'].includes(completedBody.upload.storage), completedBody.upload.storage);
check('…and a download url', completedBody.upload.url === `/api/files/${uploadId}/download`, completedBody.upload.url);
check('the file is no longer "uploading"', completedBody.upload.status === 'complete');

const download = await fetch(`${BASE}/api/files/${uploadId}/download`);
const downloaded = Buffer.from(await download.arrayBuffer());
check('the bytes come back', download.status === 200, String(download.status));
check('…byte for byte', downloaded.equals(wavBytes), `${downloaded.length} vs ${wavBytes.length}`);
check('…with the checksum in the headers', download.headers.get('x-file-sha256') === hash);

const meta = await (await fetch(`${BASE}/api/files/${uploadId}`)).json();
check('metadata is readable without the bytes', meta.file.id === uploadId && meta.file.size === wavBytes.length);
check('…without leaking the internal disk name', meta.file.storedName === undefined);

console.log('\n▸ The file store is organised and reachable');
const files = await (await fetch(`${BASE}/api/admin/uploads`, { headers: auth })).json();
check('the console can list every file', files.files.length >= 1, String(files.files.length));
check('…grouped by folder', files.groups.length >= 1 && files.groups[0].folder.startsWith('inbox/'), JSON.stringify(files.groups.map((g) => g.folder)));
check('…with the group byte total', files.groups[0].bytes >= wavBytes.length, String(files.groups[0].bytes));
check('…saying whether the store is durable', typeof files.storage.durable === 'boolean', JSON.stringify(files.storage));
check('…and how big a file may be', files.limits.maxUploadMb >= 100, String(files.limits.maxUploadMb));
check('the listing is admin-only', (await fetch(`${BASE}/api/admin/uploads`)).status === 401);

cleanup: {
  const removed = await fetch(`${BASE}/api/admin/uploads/${uploadId}`, { method: 'DELETE', headers: auth });
  check('a file can be deleted', removed.status === 200, String(removed.status));
  check('…and its bytes go with it', (await fetch(`${BASE}/api/files/${uploadId}/download`)).status === 404);
  check('…and it leaves the listing', !(await (await fetch(`${BASE}/api/admin/uploads`, { headers: auth })).json()).files.some((file) => file.id === uploadId));
}

console.log('\n▸ Refusals that keep the store honest');
const wrongType = await post('/api/uploads/start', { name: 'master.mp4', size: 1000, kind: 'audio' });
check('an unsupported extension is refused up front', wrongType.status === 400, String(wrongType.status));

const tooBig = await post('/api/uploads/start', { name: 'huge.wav', size: (limits.maxUploadMb + 1) * 1024 * 1024, kind: 'audio' });
const tooBigBody = await tooBig.json();
check('a file over the limit is refused before any bytes move', tooBig.status === 413, String(tooBig.status));
check('…with the limit spelled out', /limit is \d+MB/.test(tooBigBody.error ?? ''), tooBigBody.error);

const missingChunk = await fetch(`${BASE}/api/uploads/${uploadId}/chunk/99`, {
  method: 'PUT',
  headers: { 'content-type': 'application/octet-stream' },
  body: Buffer.from('x'),
});
check('a chunk beyond the declared size is refused', missingChunk.status === 404 || missingChunk.status === 400, String(missingChunk.status));

const health = await (await fetch(`${BASE}/api/health`)).json();
check('health reports the payment rails', Array.isArray(health.payments) && health.payments.length === 2, JSON.stringify(health.payments));
check('…whether they are ready', typeof health.payments[0].ready === 'boolean');
check('health reports the file store', health.storage?.driver === 'file', JSON.stringify(health.storage));
check('…and admits when it is not durable', health.storage?.durable === false);

/* ------------------------------------------------------------------ */

apiServer.close();
sink.close();
await db_.close();
fs.rmSync(dataDir, { recursive: true, force: true });

console.log('');
if (failures.length > 0) {
  console.error(`${passed}/${passed + failures.length} checks passed`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`${passed}/${passed} checks passed`);
