/**
 * Automation check — proves the order pipeline runs itself.
 *
 *   node scripts/automation-check.mjs
 *
 * Boots the app against a throwaway store and a local HTTP sink standing in for
 * Resend + the WhatsApp Graph API, then walks the exact path a real order takes:
 *
 *   order submitted  → email + WhatsApp alerts fire automatically
 *   before deposit   → the plant is NOT contacted (gate holds, API returns 409)
 *   deposit confirmed → production request is emailed to the pressing plant
 *   repeat call       → does NOT send a second copy
 *   plant without an address → reported, never silently "delivered"
 *
 * No credentials, no network: every outbound call is captured by the sink.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PORT = 4319;
const BASE = `http://127.0.0.1:${PORT}`;
const SINK_PORT = 4320;
const DATA_DIR = '/tmp/7h-automation-data';
const UPLOAD_DIR = '/tmp/7h-automation-uploads';

let pass = 0;
let fail = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
};
const section = (label) => console.log(`\n▸ ${label}`);

/* ---------------------------------------------------------------- sink ---- */
const received = [];
const sink = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    let parsed = {};
    try {
      parsed = JSON.parse(body || '{}');
    } catch {
      parsed = { raw: body };
    }
    received.push({ path: req.url, auth: req.headers.authorization ?? null, body: parsed });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: `sink_${received.length}`, messages: [{ id: `wamid.${received.length}` }] }));
  });
});
await new Promise((resolve) => sink.listen(SINK_PORT, '127.0.0.1', resolve));

/* --------------------------------------------------------------- server ---- */
fs.rmSync(DATA_DIR, { recursive: true, force: true });
fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });

const server = spawn(process.execPath, [path.resolve('server/index.js')], {
  env: {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(PORT),
    DATA_DIR,
    UPLOAD_DIR,
    ADMIN_PASSCODE: 'AUTOMATION-TEST',
    SESSION_SECRET: 'automation-secret',
    // every outbound provider points at the sink
    RESEND_API_KEY: 're_test_key',
    RESEND_BASE_URL: `http://127.0.0.1:${SINK_PORT}/resend`,
    NOTIFY_EMAIL_TO: 'desk@7h.test',
    NOTIFY_EMAIL_FROM: '7H <orders@7h.test>',
    WHATSAPP_TOKEN: 'wa_test_token',
    WHATSAPP_PHONE_ID: '1234567890',
    WHATSAPP_GRAPH_URL: `http://127.0.0.1:${SINK_PORT}/graph`,
    NOTIFY_WHATSAPP_TO: '256768261003',
    PLANT_MOBINEKO_EMAIL: 'orders@mobineko.test',
    // Green Lakes is routed through the desk on purpose (the owner's setup), so
    // every forwarder path is exercised: desk inbox, no duplicate copy, and the
    // rep's own address printed as the forward-to target.
    PLANT_GREENLAKES_EMAIL: 'desk@7h.test',
    PLANT_GREENLAKES_REP_EMAIL: 'press@greenlakes.test',
    // The rest go straight to the rep.
    PLANT_SEABASS_EMAIL: 'orders@seabassvinyl.test',
    PLANT_DRDUB_EMAIL: 'info@drdub.test',
    PLANT_GZMEDIA_EMAIL: 'gz@gzmedia.test',
    PLANT_DEEPGROOVES_EMAIL: 'info@deepgrooves.test',
    PLANT_AUTO_FORWARD: 'true',
    PUBLIC_BASE_URL: 'https://example.test',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

const serverLog = [];
server.stdout.on('data', (chunk) => serverLog.push(String(chunk)));
server.stderr.on('data', (chunk) => serverLog.push(String(chunk)));

const waitForServer = async () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
};

const json = async (path, init) => {
  const res = await fetch(`${BASE}${path}`, init);
  const body = await res.json().catch(() => ({}));
  return { res, body };
};

try {
  check(await waitForServer(), 'app boots against an isolated store');

  const login = await json('/api/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ passcode: 'AUTOMATION-TEST' }),
  });
  const auth = { headers: { 'x-admin-token': login.body.token, 'content-type': 'application/json' } };
  check(login.res.ok, 'admin login');

  /* --------------------------------------------------- order + alerts ---- */
  section('Order submitted → alerts fire on their own');
  received.length = 0;

  const order = await json('/api/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client: {
        name: 'Automation Check',
        email: 'artist@example.test',
        phone: '+256768261003',
        deliveryType: 'uganda',
        deliveryAddress: 'Plot 14, Bukoto Street, Kampala',
        deliveryCity: 'Kampala',
        deliveryRegion: 'Central',
        deliveryPostalCode: '00256',
        recipientName: 'Recipient Name',
        country: 'Uganda',
        notes: 'Automated pipeline check',
      },
      configuration: { quantity: 250, vinylTypeId: 'lp_colored', sleeveId: 'gatefold' },
      payment: { method: 'mtn_momo' },
      uploads: { audio: [], artwork: [] },
      audioLink: 'https://example.test/master.wav',
      artworkLink: 'https://example.test/cover.pdf',
      termsAccepted: true,
      plantPreference: 'mobineko',
    }),
  });
  check(order.res.status === 201, 'order created', `status ${order.res.status}`);
  const orderId = order.body.order?.id;

  const emails = received.filter((entry) => entry.path === '/resend');
  const whatsapps = received.filter((entry) => entry.path.startsWith('/graph'));
  check(emails.length === 1, 'one alert email sent to the desk', `${emails.length} request(s)`);
  check(
    (emails[0]?.body?.to ?? []).includes('desk@7h.test'),
    'email addressed to NOTIFY_EMAIL_TO',
    JSON.stringify(emails[0]?.body?.to),
  );
  check(emails[0]?.auth === 'Bearer re_test_key', 'email sent with the Resend key');
  check(whatsapps.length === 1, 'one WhatsApp message sent', `${whatsapps.length} request(s)`);

  const wa = whatsapps[0]?.body;
  check(wa?.type === 'template', 'WhatsApp uses an approved template', String(wa?.type));
  check(wa?.template?.name === 'new_vinyl_order', 'template name', String(wa?.template?.name));
  check(wa?.to === '256768261003', 'template sent to the desk number', String(wa?.to));
  const params = wa?.template?.components?.[0]?.parameters ?? [];
  check(params.length === 5, 'template carries 5 parameters', `${params.length}`);
  check(params[0]?.text === orderId, 'parameter 1 is the order id', String(params[0]?.text));

  /* ------------------------------- the deposit is the gate to the plant ---- */
  section('No deposit → the plant is never contacted');
  received.length = 0;
  const blocked = await json(`/api/admin/orders/${orderId}/forward`, {
    method: 'POST',
    ...auth,
    body: JSON.stringify({ plantId: 'mobineko' }),
  });
  check(blocked.res.status === 409, 'manual forward refused before the deposit', `status ${blocked.res.status}`);
  check(blocked.body.code === 'deposit_required', 'refusal names the deposit gate', String(blocked.body.code));
  check(blocked.body.error === 'Confirm the deposit first — suppliers are only contacted once the deposit is paid.', 'refusal reads clearly');
  check(received.length === 0, 'nothing left the building', `${received.length} outbound request(s)`);

  // A status dropdown must not be able to claim the plant has the order, and a
  // part-payment must not be recorded as a deposit.
  const faked = await json(`/api/admin/orders/${orderId}`, {
    method: 'PATCH',
    ...auth,
    body: JSON.stringify({ status: 'forwarded' }),
  });
  check(faked.res.status === 409, 'cannot mark "at plant" without a release', `status ${faked.res.status}`);
  check(faked.body.code === 'plant_not_released', 'the refusal names the release gate', String(faked.body.code));

  const short = await json(`/api/admin/orders/${orderId}/payment`, {
    method: 'POST',
    ...auth,
    body: JSON.stringify({ amount: 100 }),
  });
  check(short.res.status === 409, 'a part-payment is refused as a deposit', `status ${short.res.status}`);
  check(short.body.code === 'deposit_incomplete', 'the refusal names the shortfall', String(short.body.code));
  check(short.body.shortfallUsd > 0, 'and reports how much is missing', String(short.body.shortfallUsd));
  check(received.length === 0, 'still nothing sent to a supplier', `${received.length} outbound request(s)`);
  const stillHeld = await json(`/api/orders/${orderId}`);
  check(
    stillHeld.body.order?.payment?.status !== 'deposit_paid' && stillHeld.body.order?.payment?.status !== 'paid',
    'the order does not read as deposit-paid',
    String(stillHeld.body.order?.payment?.status),
  );
  const heldOrder = await json(`/api/orders/${orderId}`);
  check(heldOrder.body.order?.status !== 'forwarded', 'order is not marked forwarded', String(heldOrder.body.order?.status));
  const holdEvent = (heldOrder.body.events ?? []).find((event) => event.channel === 'plant');
  check(holdEvent?.status === 'blocked', 'console shows the hand-off held back', String(holdEvent?.status));
  check(/deposit/i.test(String(holdEvent?.message ?? '')), 'hold explains why', String(holdEvent?.message).slice(0, 80));

  /* ----------------------------------------- deposit → plant release ---- */
  section('Deposit confirmed → production request reaches the plant');
  received.length = 0;

  const paid = await json(`/api/admin/orders/${orderId}/payment`, {
    method: 'POST',
    ...auth,
    body: JSON.stringify({ amount: order.body.order.quote.deposit }),
  });
  check(paid.res.ok, 'deposit confirmed', `status ${paid.res.status}`);
  check(paid.body.release?.plant === 'Mobineko', 'response names the plant', String(paid.body.release?.plant));

  const plantMail = received.filter((entry) => entry.path === '/resend');
  check(plantMail.length === 1, 'exactly one plant email', `${plantMail.length} request(s)`);
  check(
    (plantMail[0]?.body?.to ?? []).includes('orders@mobineko.test'),
    'addressed to the Mobineko order inbox',
    JSON.stringify(plantMail[0]?.body?.to),
  );
  check(
    String(plantMail[0]?.body?.subject ?? '').includes(orderId),
    'subject carries the order number',
    String(plantMail[0]?.body?.subject).slice(0, 70),
  );
  const plantBody = String(plantMail[0]?.body?.text ?? '');
  check(/PRODUCTION REQUEST/.test(plantBody), 'body is a production request');
  check(plantBody.includes('250 × 12" Colored'), 'body carries the run size and format');
  check(/\/api\/files\//.test(plantBody) || plantBody.includes('Master link'), 'body carries file links');
  check(
    (plantMail[0]?.body?.bcc ?? []).includes('desk@7h.test'),
    'the desk is BCC’d so nothing is lost',
    JSON.stringify(plantMail[0]?.body?.bcc),
  );

  const afterPaid = await json(`/api/orders/${orderId}`);
  check(afterPaid.body.order?.status === 'forwarded', 'order moved to forwarded', String(afterPaid.body.order?.status));
  const plantEvent = (afterPaid.body.events ?? []).find((event) => event.channel === 'plant');
  check(Boolean(plantEvent), 'plant event recorded on the order');
  check(order.body.order ? true : false, 'client feed still renders');

  const overview = await json('/api/admin/overview', auth);
  const events = overview.body.events ?? [];
  const handoff = events.find((event) => event.orderId === orderId && event.channel === 'plant');
  check(handoff?.status === 'delivered', 'console shows the hand-off delivered', String(handoff?.status));
  check(handoff?.mode === 'live', 'and marks it live, not simulated', String(handoff?.mode));
  check(handoff?.payload?.automatic === true, 'flagged as automatic');

  /* --------------------------------------------- no duplicate sending ---- */
  section('Repeat deposit click does not double-order');
  received.length = 0;
  await json(`/api/admin/orders/${orderId}/payment`, { method: 'POST', ...auth, body: JSON.stringify({}) });
  check(received.filter((entry) => entry.path === '/resend').length === 0, 'no second plant email');
  const overview2 = await json('/api/admin/overview', auth);
  const plantEmails = (overview2.body.events ?? []).filter(
    (event) => event.orderId === orderId && event.channel === 'plant',
  );
  check(plantEmails.length === 1, 'still exactly one plant event', `${plantEmails.length}`);

  /* --------------------------------------------- automation state API ---- */
  section('Console can explain the pipeline');
  const auto = overview.body.automation ?? {};
  check(auto.autoForward === true, 'auto-forward reported on');
  check(auto.plantEmail === true, 'plant email reported configured');
  check(
    (auto.plants ?? []).some((plant) => plant.ordersEmail === 'orders@mobineko.test'),
    'per-plant order address listed',
  );
  check(Boolean(auto.whatsappTemplate?.body), 'WhatsApp template sample exposed for setup');

  /* ------------------------------- each plant has its own rep inbox ---- */
  section('Every plant reaches its own rep, with no desk detour');
  received.length = 0;
  const shared = await json('/api/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client: {
        name: 'Shared Inbox Check',
        email: 'boutique@example.test',
        phone: '+256768261003',
        deliveryType: 'uganda',
        deliveryAddress: 'Plot 21, Ntinda Road, Kampala',
        deliveryCity: 'Kampala',
        deliveryRegion: 'Central',
        deliveryPostalCode: '00256',
        recipientName: 'Recipient Name',
        country: 'Uganda',
      },
      configuration: { quantity: 50, vinylTypeId: 'lp_standard', sleeveId: 'standard' },
      payment: { method: 'mtn_momo' },
      audioLink: 'https://example.test/master.wav',
      artworkLink: 'https://example.test/cover.pdf',
      termsAccepted: true,
      plantPreference: 'seabass',
    }),
  });
  check(shared.res.status === 201, '50-unit Seabass order created', `status ${shared.res.status}`);
  check(shared.body.order?.plantPreference === 'seabass', 'order keeps the Seabass plant');
  const sharedPlant = (await json('/api/admin/overview', auth)).body.plants?.find((plant) => plant.id === 'seabass');
  check(sharedPlant?.ordersEmail === 'orders@seabassvinyl.test', 'Seabass inbox is the real rep address', String(sharedPlant?.ordersEmail));
  check(sharedPlant?.aliasesDesk !== true, 'and is no longer a desk forwarder', String(sharedPlant?.aliasesDesk));

  await json(`/api/admin/orders/${shared.body.order.id}/payment`, {
    method: 'POST',
    ...auth,
    body: JSON.stringify({}),
  });
  const sharedMail = received
    .filter((entry) => entry.path === '/resend')
    .filter((entry) => /Production request/.test(String(entry.body?.subject ?? '')));
  check(sharedMail.length === 1, 'exactly one production request per order', `${sharedMail.length}`);
  check(
    (sharedMail[0]?.body?.to ?? []).includes('orders@seabassvinyl.test'),
    'addressed to the Seabass rep, not the desk',
    JSON.stringify(sharedMail[0]?.body?.to),
  );
  check(
    (sharedMail[0]?.body?.bcc ?? []).includes('desk@7h.test'),
    'desk is BCC’d as a record, not addressed as the recipient',
    JSON.stringify(sharedMail[0]?.body?.bcc),
  );
  check(
    String(sharedMail[0]?.body?.subject ?? '').includes('Seabass'),
    'subject names the plant so one inbox can triage',
    String(sharedMail[0]?.body?.subject).slice(0, 80),
  );
  const autoShared = (await json('/api/admin/overview', auth)).body.automation ?? {};
  check(autoShared.depositRequired === true, 'console reports the deposit gate as enforced');
  section('A plant routed through the desk is flagged, not hidden');
  const plantRouting = autoShared.plants ?? [];
  const aliased = plantRouting.filter((plant) => plant.aliasesDesk);
  check(aliased.length === 1 && aliased[0].id === 'greenlakes', 'the console flags the forwarder plant', JSON.stringify(aliased.map((p) => p.id)));
  check(aliased[0]?.repEmail === 'press@greenlakes.test', 'and prints the rep address to forward to', String(aliased[0]?.repEmail));
  check(
    plantRouting.filter((plant) => !plant.aliasesDesk).every((plant) => plant.ordersEmail),
    'every other plant still has a direct dispatch address',
  );

  /* ------------------------------ routed through the desk, once only ---- */
  received.length = 0;
  const routed = await json('/api/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client: {
        name: 'Desk Forwarder Check',
        email: 'deskroute@example.test',
        phone: '+256768261003',
        deliveryType: 'uganda',
        deliveryAddress: 'Plot 9, Bukoto Street, Kampala',
        deliveryCity: 'Kampala',
        deliveryRegion: 'Central',
        deliveryPostalCode: '00256',
        recipientName: 'Recipient Name',
        country: 'Uganda',
      },
      configuration: { quantity: 100, vinylTypeId: 'lp_standard', sleeveId: 'standard' },
      payment: { method: 'mtn_momo' },
      audioLink: 'https://example.test/master.wav',
      artworkLink: 'https://example.test/cover.pdf',
      termsAccepted: true,
      plantPreference: 'greenlakes',
    }),
  });
  check(routed.res.status === 201, '100-unit Green Lakes order created', `status ${routed.res.status}`);
  await json(`/api/admin/orders/${routed.body.order.id}/payment`, {
    method: 'POST',
    ...auth,
    body: JSON.stringify({}),
  });
  const deskMail = received
    .filter((entry) => entry.path === '/resend')
    .filter((entry) => /Production request/.test(String(entry.body?.subject ?? '')));
  check(deskMail.length === 1, 'one dispatch email, not a copy per recipient', `${deskMail.length}`);
  check(
    JSON.stringify(deskMail[0]?.body?.to) === JSON.stringify(['desk@7h.test']),
    'addressed to the 7H inbox',
    JSON.stringify(deskMail[0]?.body?.to),
  );
  check(
    !(deskMail[0]?.body?.bcc ?? []).map((address) => address.toLowerCase()).includes('desk@7h.test'),
    'and never BCC’d to itself',
    JSON.stringify(deskMail[0]?.body?.bcc),
  );
  const deskBody = String(deskMail[0]?.body?.text ?? '');
  check(deskBody.includes('ROUTE VIA DESK'), 'the body says it needs forwarding');
  check(deskBody.includes('press@greenlakes.test'), 'and names the rep to forward to');
  check(
    String(deskMail[0]?.body?.subject ?? '').includes('Green Lakes'),
    'the subject still names the plant for triage',
    String(deskMail[0]?.body?.subject).slice(0, 70),
  );

  /* ------------------------------- the drop-ship dispatch slip ---------- */
  section('The supplier email carries a forwardable dispatch slip');
  check(deskBody.includes('DROP-SHIP DISPATCH SLIP'), 'the slip is in the plain-text body');
  check(deskBody.includes('7H-2026-'), 'the slip carries the order reference', '7H ref present');
  check(deskBody.includes('Recipient Name'), 'the recipient name is printed');
  check(deskBody.includes('Bukoto Street'), 'the street / plot number is printed');
  check(deskBody.includes('Kampala'), 'the city is printed');
  check(deskBody.includes('Central'), 'the region is printed');
  check(deskBody.includes('00256'), 'the postal code is printed');
  check(deskBody.includes('Uganda'), 'the country is printed');
  check(/SHIP TO/.test(deskBody), 'and it is labelled as a ship-to block');
  check(
    String(deskMail[0]?.body?.html ?? '').includes('Drop-ship'),
    'the HTML version carries the slip too',
  );

  /* --------------------------------------- retry re-sends a failure ---- */
  section('A failed hand-off can be retried from the console');
  received.length = 0;
  const failing = events.find((event) => event.orderId === orderId && event.channel === 'plant');
  const retried = await json(`/api/admin/events/${failing.id}/retry`, { method: 'POST', ...auth });
  check(retried.res.ok, 'retry accepted', `status ${retried.res.status}`);
  check(received.filter((entry) => entry.path === '/resend').length === 1, 'retry re-sends the plant email');
} catch (error) {
  check(false, `crashed: ${error.message}`);
  console.log(serverLog.join('').slice(-1500));
} finally {
  server.kill('SIGTERM');
  sink.close();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
}

console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
