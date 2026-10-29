/**
 * Proves the notification layer really delivers.
 *
 * Boots a local HTTP receiver, points SLACK_WEBHOOK_URL / NOTIFY_WEBHOOK_URL at
 * it, places an order through the API and asserts that:
 *   - a live Slack payload arrived with the order details
 *   - events are recorded as `mode: live` / `status: delivered`
 *   - a broken endpoint produces `failed` + an error (never a fake success)
 *   - channels revert to `simulated` when nothing is configured
 */
import http from 'node:http';
import fs from 'node:fs';

const API_PORT = 4188;
const SINK_PORT = 4189;
const BASE = `http://127.0.0.1:${API_PORT}`;
const SINK = `http://127.0.0.1:${SINK_PORT}`;
const DATA_DIR = '/tmp/7h-notify-check-data';
const UPLOAD_DIR = '/tmp/7h-notify-check-uploads';

fs.rmSync(DATA_DIR, { recursive: true, force: true });
fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });

process.env.DATA_DIR = DATA_DIR;
process.env.UPLOAD_DIR = UPLOAD_DIR;
process.env.ADMIN_PASSCODE = 'NOTIFYCODE';
delete process.env.VERCEL;

const received = [];
const sink = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = body;
    }
    received.push({ path: req.url, headers: req.headers, body: parsed });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
});
await new Promise((resolve) => sink.listen(SINK_PORT, '127.0.0.1', resolve));

const checks = [];
const check = (ok, message) => {
  checks.push({ ok, message });
  console.log(`${ok ? '✓' : '✗'} ${message}`);
};

const order = (name) => ({
  client: {
    name,
    email: 'notify@test.io',
    phone: '+256700123456',
    deliveryType: 'uganda',
    deliveryAddress: 'Plot 3 Kira Road',
    deliveryCity: 'Kampala',
    deliveryRegion: 'Central',
    deliveryPostalCode: '00256',
    recipientName: 'Recipient Name',
    country: 'Uganda',
  },
  configuration: { quantity: 250, vinylTypeId: 'lp_colored', sleeveId: 'gatefold' },
  payment: { method: 'mtn_momo' },
  audioLink: 'https://drive.google.com/master.wav',
  artworkLink: 'https://drive.google.com/art.pdf',
  termsAccepted: true,
});

async function startApi() {
  const { default: app } = await import('../api/index.js');
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(API_PORT, '127.0.0.1', resolve));
  return server;
}

const post = (path, body, headers = {}) =>
  fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body ?? {}),
  }).then(async (response) => ({ status: response.status, body: await response.json().catch(() => ({})) }));

const get = (path, headers = {}) =>
  fetch(`${BASE}${path}`, { headers }).then(async (response) => ({
    status: response.status,
    body: await response.json().catch(() => ({})),
  }));

let api = await startApi();

try {
  /* ---------- 1. nothing configured → simulated ---------- */
  const token = (await post('/api/admin/login', { passcode: 'NOTIFYCODE' })).body.token;
  const auth = { 'x-admin-token': token };

  const before = await get('/api/admin/overview', auth);
  check(before.body.notifications?.configured === false, 'no credentials → notifications reported as unconfigured');
  check(
    before.body.channels.every((channel) => channel.live === false),
    'all channels start in simulation mode',
  );

  const simulated = await post('/api/orders', order('Simulated Run'));
  const simulatedId = simulated.body.order?.id;
  check(simulated.status === 201, `order accepted (${simulatedId})`);
  check(received.length === 0, 'nothing was sent to the network while unconfigured');

  const simulatedOverview = await get('/api/admin/overview', auth);
  const simulatedEvent = simulatedOverview.body.events.find((event) => event.orderId === simulatedId);
  check(simulatedEvent?.mode === 'simulated', 'event is recorded as simulated');

  /* ---------- 2. live Slack webhook ---------- */
  // env is read per request, so no reload is needed
  process.env.SLACK_WEBHOOK_URL = `${SINK}/slack`;

  const configured = await get('/api/admin/overview', auth);
  check(configured.body.notifications?.configured === true, 'SLACK_WEBHOOK_URL switches delivery to live');
  const slackChannel = configured.body.channels.find((channel) => channel.channel === 'slack');
  check(slackChannel?.mode === 'live', 'Slack channel reported as live');

  received.length = 0;
  const live = await post('/api/orders', order('Live Slack Run'));
  const liveId = live.body.order?.id;
  const slackPost = received.find((entry) => entry.path === '/slack');

  check(Boolean(slackPost), 'Slack endpoint received a POST');
  check(
    Boolean(slackPost?.body?.blocks?.length) && String(slackPost?.body?.text).includes(liveId),
    'Slack payload contains the order blocks and ID',
  );
  check(
    JSON.stringify(slackPost?.body ?? {}).includes('Live Slack Run'),
    'Slack payload contains the client name',
  );

  const afterLive = await get('/api/admin/overview', auth);
  const liveEvent = afterLive.body.events.find(
    (event) => event.orderId === liveId && event.channel === 'slack',
  );
  check(liveEvent?.status === 'delivered' && liveEvent?.mode === 'live', 'Slack event marked delivered + live');
  check(liveEvent?.httpStatus === 200, 'HTTP status recorded');

  const emailEvent = afterLive.body.events.find(
    (event) => event.orderId === liveId && event.channel === 'email',
  );
  check(emailEvent?.mode === 'simulated', 'unconfigured channels stay simulated alongside live ones');

  /* ---------- 3. failing endpoint → failed, never fake-delivered ---------- */
  process.env.SLACK_WEBHOOK_URL = 'http://127.0.0.1:9/dead';

  const broken = await post('/api/orders', order('Broken Endpoint Run'));
  const brokenId = broken.body.order?.id;
  const brokenOverview = await get('/api/admin/overview', auth);
  const brokenEvent = brokenOverview.body.events.find(
    (event) => event.orderId === brokenId && event.channel === 'slack',
  );
  check(brokenEvent?.status === 'failed', 'unreachable endpoint records a failure');
  check(Boolean(brokenEvent?.error), `failure includes the reason (${String(brokenEvent?.error).slice(0, 60)})`);

  // retry re-attempts the real delivery
  const retry = await post(`/api/admin/events/${brokenEvent.id}/retry`, {}, auth);
  check(retry.body.event?.status === 'failed' && retry.body.event?.attempts > 1, 'retry re-attempts and records the attempt');

  /* ---------- 4. generic webhook covers every channel ---------- */
  delete process.env.SLACK_WEBHOOK_URL;
  process.env.NOTIFY_WEBHOOK_URL = `${SINK}/generic`;

  received.length = 0;
  const generic = await post('/api/orders', order('Generic Webhook Run'));
  const genericId = generic.body.order?.id;
  const genericPosts = received.filter((entry) => entry.path === '/generic');

  check(genericPosts.length >= 3, `generic webhook received one payload per channel (${genericPosts.length})`);
  check(
    genericPosts.some((entry) => entry.body?.order?.id === genericId && entry.body?.channel === 'whatsapp'),
    'generic payload is order-structured and channel-tagged',
  );

  const genericOverview = await get('/api/admin/overview', auth);
  const genericDelivered = genericOverview.body.events.filter(
    (event) => event.orderId === genericId && event.status === 'delivered',
  );
  check(genericDelivered.length >= 3, 'all auto channels marked delivered through the generic webhook');
} catch (error) {
  check(false, `crashed: ${error.message}\n${error.stack}`);
} finally {
  await new Promise((resolve) => api.close(resolve));
  await new Promise((resolve) => sink.close(resolve));
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
}

const failed = checks.filter((entry) => !entry.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed > 0 ? 1 : 0);
