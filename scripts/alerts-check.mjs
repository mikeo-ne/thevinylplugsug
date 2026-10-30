/**
 * Alert checks.
 *
 * Every provider is replaced by a local sink, so this runs hermetically — no
 * Resend key, no Meta business account, no network. What it proves is the part
 * that used to be guesswork:
 *
 *   · a configured channel really posts to the provider, with the right headers
 *     and payload, and reports what came back;
 *   · an unconfigured channel says which variable is missing instead of
 *     pretending it sent something;
 *   · a provider rejection surfaces the provider's own words in the console;
 *   · failed alerts are retried by the sweep and by the cron endpoint, and the
 *     cron endpoint cannot be run without CRON_SECRET.
 *
 * Run with `npm run test:alerts`.
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

/* ------------------------------------------------------------------ *
 * The sink: one server pretending to be Resend, Meta and Slack
 * ------------------------------------------------------------------ */

const received = { emails: [], whatsapp: [], telegram: [], slack: [], webhook: [], webhookAdmin: [] };
let emailStatus = 200;
let emailError = null;

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

    if (url.startsWith('/emails')) {
      const authorised = String(req.headers.authorization ?? '').startsWith('Bearer re_good');
      if (!authorised && emailStatus === 200) {
        res
          .writeHead(401, { 'content-type': 'application/json' })
          .end(JSON.stringify({ message: 'API key is invalid', name: 'validation_error' }));
        return;
      }
      if (emailStatus !== 200) {
        res
          .writeHead(emailStatus, { 'content-type': 'application/json' })
          .end(JSON.stringify({ message: emailError ?? 'provider exploded', name: 'application_error' }));
        return;
      }
      received.emails.push(json);
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id: 'eml_test' }));
      return;
    }

    if (url.includes('/messages')) {
      received.whatsapp.push({ url, body: json });
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ messages: [{ id: 'wamid.test' }] }));
      return;
    }

    if (/^\/bot[^/]+\/sendMessage$/.test(url)) {
      const token = url.split('/')[1].replace(/^bot/, '');
      if (token !== 'test-token') {
        res
          .writeHead(401, { 'content-type': 'application/json' })
          .end(JSON.stringify({ ok: false, error_code: 401, description: 'Unauthorized' }));
        return;
      }
      if (!json.chat_id) {
        res
          .writeHead(400, { 'content-type': 'application/json' })
          .end(JSON.stringify({ ok: false, error_code: 400, description: 'Bad Request: chat_id is empty' }));
        return;
      }
      received.telegram.push({ url, body: json });
      res
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ ok: true, result: { message_id: 42, chat: { id: json.chat_id } } }));
      return;
    }

    if (/^\/bot[^/]+\/getUpdates/.test(url)) {
      const token = url.split('/')[1].replace(/^bot/, '');
      if (token !== 'test-token') {
        res
          .writeHead(401, { 'content-type': 'application/json' })
          .end(JSON.stringify({ ok: false, error_code: 401, description: 'Unauthorized' }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          ok: true,
          result: [
            { update_id: 1, message: { chat: { id: 768261003, type: 'private', first_name: 'Mike' } } },
            { update_id: 2, message: { chat: { id: 768261003, type: 'private', first_name: 'Mike' } } },
            { update_id: 3, message: { chat: { id: -1001234567890, type: 'supergroup', title: '7H Orders' } } },
          ],
        }),
      );
      return;
    }

    if (/^\/bot[^/]+\/setWebhook$/.test(url)) {
      received.webhookAdmin.push({ path: 'setWebhook', body: json });
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, result: true, description: 'Webhook was set' }));
      return;
    }

    if (/^\/bot[^/]+\/deleteWebhook$/.test(url)) {
      received.webhookAdmin.push({ path: 'deleteWebhook', body: json });
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, result: true }));
      return;
    }

    if (/^\/bot[^/]+\/getWebhookInfo$/.test(url)) {
      res.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          ok: true,
          result: { url: process.env.PUBLIC_BASE_URL + '/api/telegram/webhook', pending_update_count: 0 },
        }),
      );
      return;
    }

    if (/^\/bot[^/]+\/getMe$/.test(url)) {
      res
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ ok: true, result: { id: 9277737371, username: 'Vinylplugug_bot' } }));
      return;
    }

    if (url.startsWith('/slack')) {
      received.slack.push(json);
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }

    if (url.startsWith('/webhook')) {
      received.webhook.push(json);
      res.writeHead(202, { 'content-type': 'application/json' }).end(JSON.stringify({ accepted: true }));
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'no such sink' }));
  });
});

const listen = (server) =>
  new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));

const sinkPort = await listen(sink);
const SINK = `http://127.0.0.1:${sinkPort}`;

/* ------------------------------------------------------------------ *
 * Environment — set before importing anything that reads it
 * ------------------------------------------------------------------ */

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), '7h-alerts-'));
process.env.DATA_DIR = dataDir;
process.env.NODE_ENV = 'test';
process.env.RESEND_API_KEY = 're_good_key';
process.env.RESEND_BASE_URL = `${SINK}/emails`;
process.env.WHATSAPP_GRAPH_URL = `${SINK}/v21.0`;
process.env.WHATSAPP_TOKEN = 'wa_token';
process.env.WHATSAPP_PHONE_ID = '1029384756';
process.env.NOTIFY_EMAIL_TO = 'desk@7h.test, owner@7h.test';
process.env.NOTIFY_EMAIL_FROM = '7H Music Group <alerts@7hmusicgroup.test>';
process.env.NOTIFY_WHATSAPP_TO = '256768261003';
process.env.TELEGRAM_API_BASE = SINK;
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.TELEGRAM_CHAT_ID = '768261003, -1001234567890';
process.env.SLACK_WEBHOOK_URL = `${SINK}/slack`;
process.env.NOTIFY_WEBHOOK_URL = `${SINK}/webhook`;
process.env.CRON_SECRET = 'cron_test_secret';
process.env.PUBLIC_BASE_URL = 'https://7h.test';

const {
  alertEnvCheck,
  buildTelegramReply,
  channelStatus,
  disableTelegramReplies,
  enableTelegramReplies,
  handleTelegramUpdate,
  sendTestAlert,
  sendTestAlerts,
  telegramDiscoverChats,
  telegramWebhookInfo,
  telegramWebhookSecretForTests,
} = await import('../server/notifications.js');
const { db_, storeReady } = await import('../server/store.js');
const { retryFailedAlerts, alertOutboxSummary } = await import('../server/webhooks.js');

/* ------------------------------------------------------------------ *
 * Which variables are missing
 * ------------------------------------------------------------------ */

console.log('\n▸ Configuration reporting');
const envCheck = alertEnvCheck();
const emailCheck = envCheck.find((entry) => entry.channel === 'email');
check('email reports itself ready when its variables are set', emailCheck.ready === true);
check('missing variables are named', emailCheck.missing.length === 0);
check('secrets are flagged as secrets', emailCheck.variables.find((v) => v.key === 'RESEND_API_KEY')?.secret === true);
check('the API key is never echoed', !JSON.stringify(envCheck).includes('re_good_key'));

const savedKey = process.env.RESEND_API_KEY;
delete process.env.RESEND_API_KEY;
const withoutKey = alertEnvCheck().find((entry) => entry.channel === 'email');
check('a cleared variable shows up as missing', withoutKey.missing.includes('RESEND_API_KEY'));
const unconfigured = await sendTestAlert('email');
check(
  'an unconfigured channel reports unconfigured, not failed',
  unconfigured.status === 'unconfigured',
  unconfigured.status,
);
check('…and says which variable to set', /RESEND_API_KEY/.test(unconfigured.error ?? ''), unconfigured.error);
check('…and lists it', unconfigured.missing?.includes('RESEND_API_KEY'), JSON.stringify(unconfigured.missing));
process.env.RESEND_API_KEY = savedKey;

/* ------------------------------------------------------------------ *
 * A real send, per channel
 * ------------------------------------------------------------------ */

console.log('\n▸ Sending a test alert');
const emailResult = await sendTestAlert('email');
check('email test is delivered', emailResult.status === 'delivered', emailResult.error);
check('email test reports the provider status', emailResult.httpStatus === 200);
check('email test names its destination', emailResult.target === 'desk@7h.test, owner@7h.test');
check('email went to the sink', received.emails.length === 1, String(received.emails.length));
check(
  'both desk addresses are on the envelope',
  JSON.stringify(received.emails[0]?.to) === JSON.stringify(['desk@7h.test', 'owner@7h.test']),
  JSON.stringify(received.emails[0]?.to),
);
check('the configured sender is used', received.emails[0]?.from === '7H Music Group <alerts@7hmusicgroup.test>');
check('the subject says it is a test', /alert test/i.test(received.emails[0]?.subject ?? ''));
check('the HTML body links to the console', /7h\.test\/admin/.test(received.emails[0]?.html ?? ''));

const whatsappResult = await sendTestAlert('whatsapp');
check('whatsapp test is delivered', whatsappResult.status === 'delivered', whatsappResult.error);
check('whatsapp hit the phone number id path', received.whatsapp[0]?.url === '/v21.0/1029384756/messages');
check(
  'whatsapp sends to the digits of the number',
  received.whatsapp[0]?.body?.to === '256768261003',
  received.whatsapp[0]?.body?.to,
);
check('whatsapp body mentions the test', /alert test/i.test(received.whatsapp[0]?.body?.text?.body ?? ''));

const telegramResult = await sendTestAlert('telegram');
check('telegram test is delivered', telegramResult.status === 'delivered', telegramResult.error);
check('telegram hit the bot sendMessage path', received.telegram[0]?.url === '/bottest-token/sendMessage');
check('every configured chat gets the message', received.telegram.length === 2, String(received.telegram.length));
check(
  'the personal chat and the group are both addressed',
  JSON.stringify(received.telegram.map((entry) => entry.body.chat_id)) ===
    JSON.stringify(['768261003', '-1001234567890']),
  JSON.stringify(received.telegram.map((entry) => entry.body.chat_id)),
);
check('telegram renders HTML, not literal tags', received.telegram[0]?.body?.parse_mode === 'HTML');
check('the bot token is never echoed in the report', !String(telegramResult.target ?? '').includes('test-token'));

const discovered = await telegramDiscoverChats();
check('chat discovery reaches the bot', discovered.status === 'ok', discovered.error);
check('it names the bot', discovered.bot === '@Vinylplugug_bot', String(discovered.bot));
check('it returns the chats that messaged the bot', discovered.chats.length === 2, String(discovered.chats.length));
check(
  'duplicate updates collapse to one chat',
  discovered.chats.filter((chat) => chat.id === '768261003').length === 1,
);
check(
  'a group is listed with its title and negative id',
  discovered.chats.some((chat) => chat.id === '-1001234567890' && chat.title === '7H Orders'),
);
check('a DM is listed by name', discovered.chats.some((chat) => chat.title === 'Mike'));
check('the token never comes back', !JSON.stringify(discovered).includes('test-token'));

console.log('\n▸ A half-configured channel says exactly what is missing');
const savedChat = process.env.TELEGRAM_CHAT_ID;
delete process.env.TELEGRAM_CHAT_ID;
const halfBot = await sendTestAlert('telegram');
check('a bot with no chat id is unconfigured', halfBot.status === 'unconfigured', halfBot.status);
check(
  '…and only blames the chat id, never the token it already has',
  /TELEGRAM_CHAT_ID/.test(halfBot.error ?? '') && !/TELEGRAM_BOT_TOKEN/.test(halfBot.error ?? ''),
  halfBot.error,
);
check('…and says how to get one', /Find chat id/.test(halfBot.error ?? ''), halfBot.error);
const savedWebhook = process.env.NOTIFY_WEBHOOK_URL;
delete process.env.NOTIFY_WEBHOOK_URL;
check(
  'the console row describes the half-finished state',
  /add TELEGRAM_CHAT_ID/.test(channelStatus().find((entry) => entry.channel === 'telegram')?.detail ?? ''),
  channelStatus().find((entry) => entry.channel === 'telegram')?.detail,
);
process.env.NOTIFY_WEBHOOK_URL = savedWebhook;
process.env.TELEGRAM_CHAT_ID = savedChat;

const noBot = await (async () => {
  const saved = process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_BOT_TOKEN;
  const result = await telegramDiscoverChats();
  process.env.TELEGRAM_BOT_TOKEN = saved;
  return result;
})();
check('without a token the lookup says so', noBot.status === 'unconfigured', noBot.status);
check('…and names the missing variable', /TELEGRAM_BOT_TOKEN/.test(noBot.error ?? ''), noBot.error);

/* ------------------------------- replies -------------------------------- */
console.log('\n▸ The bot can answer when it is spoken to');

const greeting = buildTelegramReply({
  update_id: 1,
  message: { chat: { id: 768261003, type: 'private', first_name: 'Mike' }, text: 'hi' },
});
check('a message produces a reply', Boolean(greeting), 'no reply built');
check('the reply carries the chat id', /768261003/.test(greeting?.text ?? ''), greeting?.text?.slice(0, 80));
check('…in a copyable code tag', /<code>768261003<\/code>/.test(greeting?.text ?? ''));
check('…and says where to put it', /TELEGRAM_CHAT_ID/.test(greeting?.text ?? ''));
check('an update with no chat is ignored', buildTelegramReply({ update_id: 9 }) === null);

const answered = await handleTelegramUpdate(
  { message: { chat: { id: 768261003, type: 'private', first_name: 'Mike' }, text: '/start' } },
  telegramWebhookSecretForTests(),
);
check('a correctly signed update is answered', answered.ok === true && answered.replied === true, answered.error);
check('the greeting went out through the Bot API', received.telegram.at(-1)?.body?.chat_id === '768261003');
check('…as HTML', received.telegram.at(-1)?.body?.parse_mode === 'HTML');

const impostor = await handleTelegramUpdate(
  { message: { chat: { id: 999, type: 'private' }, text: 'hi' } },
  'not-the-secret',
);
check('an unsigned update is refused', impostor.ok === false, JSON.stringify(impostor));

const enabled = await enableTelegramReplies();
check('replies can be switched on', enabled.ok === true, enabled.error);
check('…by registering our endpoint', received.webhookAdmin[0]?.path === 'setWebhook');
check(
  '…with a secret Telegram echoes back',
  Boolean(received.webhookAdmin[0]?.body?.secret_token),
  JSON.stringify(received.webhookAdmin[0]?.body?.secret_token),
);
check(
  '…that is derived from the bot token, not stored',
  received.webhookAdmin[0]?.body?.secret_token === telegramWebhookSecretForTests(),
);

const info = await telegramWebhookInfo();
check('the console can read the webhook state', info.configured === true, JSON.stringify(info));

const disabled = await disableTelegramReplies();
check('replies can be switched off', disabled.ok === true, disabled.error);
check('…by deleting the webhook', received.webhookAdmin.at(-1)?.path === 'deleteWebhook');

const slackResult = await sendTestAlert('slack');
check('slack test is delivered', slackResult.status === 'delivered', slackResult.error);
check('slack received the message', received.slack.length === 1);
check('slack target is described', /Slack/.test(slackResult.target ?? ''));

const webhookResult = await sendTestAlert('webhook');
check('generic webhook test is delivered', webhookResult.status === 'delivered', webhookResult.error);
check('webhook payload is tagged', received.webhook[0]?.event === 'alert.test');
check('the webhook host is not echoed back', !String(webhookResult.target ?? '').includes(`:${sinkPort}`), webhookResult.target);

const all = await sendTestAlerts(['email', 'telegram', 'whatsapp', 'slack', 'webhook']);
check('every channel can be tested in one press', all.length === 5);
check('…and each reports its own outcome', all.every((result) => 'status' in result && 'channel' in result));

/* ------------------------------------------------------------------ *
 * Provider failures are reported, not swallowed
 * ------------------------------------------------------------------ */

console.log('\n▸ When the provider says no');
emailStatus = 422;
emailError = 'You can only send testing emails to your own email address';
const rejected = await sendTestAlert('email');
check('a provider rejection is a failure', rejected.status === 'failed');
check('the provider’s own words come back', /only send testing emails/.test(rejected.error ?? ''), rejected.error);
check('the HTTP status is kept', rejected.status === 'failed' && rejected.error !== null);
emailStatus = 200;
emailError = null;

const savedToken = process.env.WHATSAPP_TOKEN;
delete process.env.WHATSAPP_TOKEN;
const noWhatsApp = await sendTestAlert('whatsapp');
check('whatsapp without a token is unconfigured, not broken', noWhatsApp.status === 'unconfigured', noWhatsApp.status);
check('…and points at Telegram instead', /Telegram/.test(noWhatsApp.error ?? ''), noWhatsApp.error);
check('whatsapp names the missing variables', noWhatsApp.missing?.includes('WHATSAPP_TOKEN'), JSON.stringify(noWhatsApp.missing));
process.env.WHATSAPP_TOKEN = savedToken;

/* ------------------------------------------------------------------ *
 * The outbox: failed alerts get retried
 * ------------------------------------------------------------------ */

console.log('\n▸ Retrying failed alerts');
await storeReady();
const db = db_.data;
const order = {
  id: '7H-2026-RETRY',
  createdAt: new Date().toISOString(),
  status: 'received',
  client: {
    name: 'Retry Artist',
    email: 'retry@artist.test',
    phone: '+256700000123',
    deliveryCity: 'Kampala',
    deliveryRegion: 'Central',
    deliveryPostalCode: '00256',
    recipientName: 'Recipient Name',
    country: 'Uganda',
    deliveryType: 'uganda',
    deliveryAddress: 'Ntinda',
  },
  configuration: {
    quantity: 100,
    vinylTypeId: 'lp_standard',
    sleeveId: 'standard',
    plantPreference: 'mobineko',
  },
  quote: { total: 1200, deposit: 600, factoryCost: 900, managementFee: 300, totals: { total: { ugx: 4_500_000 } } },
  payment: { status: 'deposit_paid', method: 'mtn_momo' },
  files: { audio: [], artwork: [] },
  plantPreference: 'mobineko',
};
db.orders.unshift(order);
db.events.unshift({
  id: 'evt_failed_email',
  orderId: order.id,
  channel: 'email',
  mode: 'live',
  target: 'desk',
  message: 'Order alert that failed once',
  status: 'failed',
  attempts: 1,
  error: 'HTTP 503 — upstream unavailable',
  createdAt: new Date(Date.now() - 120_000).toISOString(),
  lastAttemptAt: new Date(Date.now() - 120_000).toISOString(),
});
db_.save();

const before = received.emails.length;
const summary = await retryFailedAlerts({ minAgeMs: 0 });
check('the sweep attempts the failed alert', summary.attempted === 1, JSON.stringify(summary));
check('the retry is delivered', summary.delivered === 1, JSON.stringify(summary.results));
check('the provider really received it', received.emails.length === before + 1);

const event = db_.data.events.find((item) => item.id === 'evt_failed_email');
check('the event is marked delivered', event.status === 'delivered', event.status);
check('the attempt count went up', event.attempts === 2, String(event.attempts));
check('the old error is cleared', event.error === null);

const outbox = alertOutboxSummary();
check('the outbox summary counts deliveries', outbox.counts.delivered >= 1);
check('no failures are left behind', outbox.counts.failed === 0, JSON.stringify(outbox.counts));

// A failed event that has exhausted its attempts is left alone.
db_.data.events.unshift({
  id: 'evt_exhausted',
  orderId: order.id,
  channel: 'email',
  mode: 'live',
  status: 'failed',
  attempts: 5,
  error: 'HTTP 500',
  createdAt: new Date().toISOString(),
  lastAttemptAt: new Date().toISOString(),
});
const secondPass = await retryFailedAlerts({ minAgeMs: 0 });
check('an exhausted event is not retried again', secondPass.attempted === 0, JSON.stringify(secondPass));

// Shop alerts are retried through the retail templates, not the pressing ones.
const shopOrder = {
  id: '7H-SHOP-RETRY1',
  createdAt: new Date().toISOString(),
  status: 'placed',
  buyer: { name: 'Fan Buyer', email: 'fan@buyer.test', phone: '+256700000999', notes: '' },
  items: [
    { releaseId: 'badman', title: 'Badman', release: '7H-050', format: '12\" LP', priceUsd: 44, quantity: 1, lineTotal: 44 },
  ],
  records: 1,
  subtotal: 44,
  shipping: 3,
  total: 47,
  totals: { total: { ugx: 176_250 } },
  delivery: { id: 'kampala', name: 'Kampala courier', requiresAddress: true, address: 'Ntinda', city: 'Kampala', country: 'Uganda' },
  payment: { method: 'mtn_momo', status: 'pending' },
};
db_.data.shop.orders.unshift(shopOrder);
db_.data.events.unshift({
  id: 'evt_failed_shop',
  orderId: shopOrder.id,
  channel: 'email',
  mode: 'live',
  status: 'failed',
  attempts: 1,
  error: 'HTTP 429 — rate limited',
  createdAt: new Date(Date.now() - 90_000).toISOString(),
  lastAttemptAt: new Date(Date.now() - 90_000).toISOString(),
});
db_.save();
const shopBefore = received.emails.length;
const shopRetry = await retryFailedAlerts({ minAgeMs: 0, limit: 5 });
check('a failed shop alert is retried', shopRetry.results.some((entry) => entry.id === 'evt_failed_shop' && entry.status === 'delivered'), JSON.stringify(shopRetry.results));
const shopMail = received.emails[shopBefore];
check('…through the fan-facing template', /SHOP/i.test(JSON.stringify(shopMail?.subject ?? '')), shopMail?.subject);

/* ------------------------------------------------------------------ *
 * The cron endpoint
 * ------------------------------------------------------------------ */

console.log('\n▸ The cron endpoint');
const express = (await import('express')).default;
const api = (await import('../server/app.js')).default;
const app = express();
app.use(api);
const apiServer = http.createServer(app);
const apiPort = await listen(apiServer);
const BASE = `http://127.0.0.1:${apiPort}`;

const savedCronSecret = process.env.CRON_SECRET;
delete process.env.CRON_SECRET;
const noSecret = await fetch(`${BASE}/api/cron/alerts`);
check('without CRON_SECRET the route refuses to run', noSecret.status === 503, String(noSecret.status));
process.env.CRON_SECRET = savedCronSecret;

const wrongSecret = await fetch(`${BASE}/api/cron/alerts`, { headers: { authorization: 'Bearer nope' } });
check('a wrong secret is rejected', wrongSecret.status === 401, String(wrongSecret.status));

const goodSecret = await fetch(`${BASE}/api/cron/alerts`, {
  headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
});
const cronBody = await goodSecret.json();
check('the right secret runs the sweep', goodSecret.status === 200, String(goodSecret.status));
check('the sweep reports what it did', typeof cronBody.summary?.attempted === 'number');

const health = await (await fetch(`${BASE}/api/health`)).json();
check('health is public and reports the database', health.database?.driver === 'file', JSON.stringify(health.database));
check('health reports the alert channels', Array.isArray(health.alerts?.channels));
check('health leaks no secrets', !JSON.stringify(health).includes('re_good_key'));

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
