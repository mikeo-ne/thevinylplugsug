/**
 * Verifies the Vercel serverless handler locally.
 *
 * Boots `api/index.js` (the exact module Vercel runs) behind Node's http
 * server with VERCEL=1 + an isolated /tmp store, then exercises the endpoints —
 * including stateless admin tokens and elapsed-time webhook reconciliation.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 4187;
const BASE = `http://127.0.0.1:${PORT}`;
const TEST_DATA = '/tmp/7h-serverless-check';
const TEST_UPLOADS = '/tmp/7h-serverless-uploads';

fs.rmSync(TEST_DATA, { recursive: true, force: true });
fs.rmSync(TEST_UPLOADS, { recursive: true, force: true });

process.env.VERCEL = '1';
process.env.DATA_DIR = TEST_DATA;
process.env.UPLOAD_DIR = TEST_UPLOADS;
process.env.ADMIN_PASSCODE = 'CHECKCODE';
process.env.SESSION_SECRET = 'serverless-check-secret';

const { default: handler } = await import('../api/index.js');

const server = http.createServer(handler);
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

const checks = [];
const check = (ok, message) => {
  checks.push({ ok, message });
  console.log(`${ok ? '✓' : '✗'} ${message}`);
};

const json = async (path, init) => {
  const response = await fetch(`${BASE}${path}`, init);
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
};

const post = (path, data, headers = {}) =>
  json(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(data ?? {}),
  });

try {
  const health = await json('/api/health');
  check(health.status === 200 && health.body.ok, 'handler serves /api/health');

  const config = await json('/api/config');
  check(config.status === 200 && config.body.vinylTypes.length === 3, 'catalogue loads');

  const login = await post('/api/admin/login', { passcode: 'CHECKCODE' });
  check(login.status === 200 && typeof login.body.token === 'string', 'admin login issues a token');

  const profile = login.body.token.split('.');
  check(profile.length === 2, 'token is stateless (payload.signature)');

  const stale = await json('/api/admin/overview', { headers: { 'x-admin-token': 'nope.nope' } });
  check(stale.status === 401, 'invalid token is rejected');

  const order = await post('/api/orders', {
    client: {
      name: 'Vercel Check',
      email: 'check@vercel.io',
      phone: '+256700999888',
      deliveryType: 'uganda',
      deliveryAddress: 'Plot 9 Kira Road',
      deliveryCity: 'Kampala',
      country: 'Uganda',
    },
    configuration: { quantity: 100, vinylTypeId: 'seven_single', sleeveId: 'standard' },
    payment: { method: 'airtel_money' },
    audioLink: 'https://drive.google.com/master.wav',
    artworkLink: 'https://drive.google.com/art.pdf',
    termsAccepted: true,
  });
  check(order.status === 201 && /^7H-\d{4}-[A-Z0-9]{4}$/.test(order.body.order?.id ?? ''), 'order created');

  const orderId = order.body.order?.id;
  const immediate = await json(`/api/orders/${orderId}`);
  const pendingNow = immediate.body.events.filter((event) => event.status !== 'delivered').length;
  check(pendingNow > 0, 'alerts start pending');

  await new Promise((resolve) => setTimeout(resolve, 2800));

  const settled = await json(`/api/orders/${orderId}`);
  const delivered = settled.body.events.filter((event) => event.channel !== 'plant');
  check(
    delivered.length === 3 && delivered.every((event) => event.status === 'delivered'),
    'elapsed-time reconciliation marks Slack/email/WhatsApp delivered',
  );

  const overview = await json('/api/admin/overview', {
    headers: { 'x-admin-token': login.body.token },
  });
  check(overview.status === 200 && overview.body.orders.length >= 3, 'admin overview lists orders');

  const tracked = overview.body.orders.find((item) => item.id === orderId);
  check(Boolean(tracked) && tracked.quote.total === 1275, `server quote is authoritative ($${tracked?.quote.total})`);

  // The deposit gates the plant: a cold forward is refused, not silently sent.
  const gated = await post(
    `/api/admin/orders/${orderId}/forward`,
    { plantId: 'greenlakes' },
    { 'x-admin-token': login.body.token },
  );
  check(
    gated.status === 409 && gated.body.code === 'deposit_required',
    'forward is refused until the deposit is confirmed',
    `status ${gated.status}`,
  );

  await post(
    `/api/admin/orders/${orderId}/payment`,
    { amount: tracked?.quote?.deposit },
    { 'x-admin-token': login.body.token },
  );

  const forwarded = await post(
    `/api/admin/orders/${orderId}/forward`,
    { plantId: 'greenlakes' },
    { 'x-admin-token': login.body.token },
  );
  check(
    forwarded.status === 200 && forwarded.body.plant?.id === 'greenlakes',
    'forward to Green Lakes works without session state',
  );

  const strippedUrl = await json('/health');
  check(strippedUrl.status === 200 && strippedUrl.body.ok, 'handler tolerates a stripped /api prefix');

  // Mirrors the vercel.json rewrite: /api/(.*) -> /api?path=$1
  const rewritten = await fetch(`${BASE}/api?path=config`);
  const rewrittenBody = await rewritten.json().catch(() => ({}));
  check(
    rewritten.status === 200 && Array.isArray(rewrittenBody.vinylTypes),
    'rewrite form (/api?path=config) resolves the catalogue',
  );

  const rewrittenQuery = await fetch(`${BASE}/api?path=orders/${orderId}`);
  const rewrittenOrder = await rewrittenQuery.json().catch(() => ({}));
  check(
    rewrittenQuery.status === 200 && rewrittenOrder.order?.id === orderId,
    'rewrite form keeps multi-segment paths and returns JSON',
  );

  const unknown = await json('/api/does-not-exist');
  check(unknown.status === 404, 'unknown API route returns JSON 404');

  // Brute force must hit a wall: 6 wrong codes, then a lockout even for the right one.
  let lastStatus = 0;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const res = await fetch(`${BASE}/api/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ passcode: `nope-${attempt}` }),
    });
    lastStatus = res.status;
  }
  check(lastStatus === 429, 'admin login rate-limits repeated wrong codes');

  check(fs.existsSync(TEST_DATA), 'store writes to the configured /tmp data dir');
  check(fs.existsSync(TEST_UPLOADS), 'uploads dir created under /tmp');
} catch (error) {
  check(false, `crashed: ${error.message}`);
} finally {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(TEST_DATA, { recursive: true, force: true });
  fs.rmSync(TEST_UPLOADS, { recursive: true, force: true });
}

const failed = checks.filter((entry) => !entry.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed > 0 ? 1 : 0);
