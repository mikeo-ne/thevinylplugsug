/**
 * Shop check — proves a fan can actually buy a record.
 *
 *   node scripts/shop-check.mjs
 *
 * Boots the app against a throwaway store and a local HTTP sink standing in for
 * Resend + the WhatsApp Graph API, then walks the retail path end to end:
 *
 *   shop loads     → five records, live stock, five delivery options
 *   place order    → stock decrements, totals add up, desk + buyer are alerted
 *   oversell       → refused, nothing decremented, nothing sent
 *   bad input      → named field errors, no order created
 *   admin          → sees the order, marks it paid, ships it, can restock
 *   cancel         → records go back on the shelf
 *
 * No credentials, no network: every outbound call is captured by the sink.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PORT = 4321;
const BASE = `http://127.0.0.1:${PORT}`;
const SINK_PORT = 4322;
const DATA_DIR = '/tmp/7h-shop-data';
const UPLOAD_DIR = '/tmp/7h-shop-uploads';

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
    ADMIN_PASSCODE: 'SHOP-TEST',
    SESSION_SECRET: 'shop-secret',
    RESEND_API_KEY: 're_test_key',
    RESEND_BASE_URL: `http://127.0.0.1:${SINK_PORT}/resend`,
    NOTIFY_EMAIL_TO: 'desk@7h.test',
    NOTIFY_EMAIL_FROM: '7H <orders@7h.test>',
    WHATSAPP_TOKEN: 'wa_test_token',
    WHATSAPP_PHONE_ID: '1234567890',
    WHATSAPP_GRAPH_URL: `http://127.0.0.1:${SINK_PORT}/graph`,
    NOTIFY_WHATSAPP_TO: '256768261003',
    FX_UGX_PER_USD: '3750',
    // This script places more orders in a minute than any human would.
    SHOP_ORDERS_PER_MINUTE: '999',
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

const json = async (url, init) => {
  const res = await fetch(`${BASE}${url}`, init);
  const body = await res.json().catch(() => ({}));
  return { res, body };
};

const post = (url, body, headers = {}) =>
  json(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

const patch = (url, body, headers = {}) =>
  json(url, { method: 'PATCH', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

const stockOf = async (id) => {
  const { body } = await json('/api/shop');
  return (body.releases ?? []).find((release) => release.id === id)?.stock;
};

const emails = () => received.filter((entry) => entry.path === '/resend');
const whatsapps = () => received.filter((entry) => entry.path.startsWith('/graph'));

const validBuyer = {
  name: 'Nakato Aisha',
  email: 'aisha@example.test',
  phone: '+256772345678',
  notes: 'Leave with the guard at the gate.',
};

const validOrder = (overrides = {}) => ({
  buyer: validBuyer,
  items: [
    { releaseId: 'made-in-entebbe', quantity: 1 },
    { releaseId: 'with-the-gs', quantity: 2 },
  ],
  delivery: { id: 'kampala', address: 'Plot 12 Bukoto Street, Kamwokya', city: 'Kampala', country: 'Uganda' },
  payment: { method: 'mtn_momo', payerPhone: '+256772345678' },
  ...overrides,
});

try {
  check(await waitForServer(), 'app boots against an isolated store');

  /* ------------------------------------------------------ the shelf ---- */
  section('The shop opens with real records and live stock');
  const shop = await json('/api/shop');
  check(shop.res.ok, 'shop catalogue loads', `status ${shop.res.status}`);
  check(shop.body.releases?.length === 5, 'five records on sale', `${shop.body.releases?.length}`);
  check(
    shop.body.releases?.every((release) => release.priceUsd > 0 && release.stock > 0 && release.image),
    'every record has a price, stock and cover',
  );
  check(
    shop.body.releases?.every((release) => release.soldOut === false && release.maxPerOrder > 0),
    'nothing is sold out on a fresh store',
  );
  check(shop.body.delivery?.length === 5, 'five delivery options', `${shop.body.delivery?.length}`);
  check(
    shop.body.delivery?.find((option) => option.id === 'pickup')?.priceUsd === 0,
    'studio pickup is free',
  );
  check(shop.body.delivery?.some((option) => option.zone === 'international'), 'international shipping offered');
  check(
    shop.body.paymentMethods?.length === 3 &&
      ['mtn_momo', 'airtel_money', 'card_bank'].every((id) =>
        shop.body.paymentMethods.some((method) => method.id === id),
      ),
    'MoMo, Airtel Money and card are all offered',
  );
  check(shop.body.fxRate === 3750, 'UGX rate comes from the environment', String(shop.body.fxRate));

  /* ------------------------------------------------------- console ---- */
  section('The console is reachable for shop management');
  const login = await post('/api/admin/login', { passcode: 'SHOP-TEST' });
  const adminHeaders = { 'x-admin-token': login.body.token, 'content-type': 'application/json' };
  check(login.res.ok, 'admin login');

  /* -------------------------------------------------------- buying ---- */
  section('A fan buys two records with a Kampala courier');
  received.length = 0;
  const beforeBadman = await stockOf('made-in-entebbe');
  const beforeSingle = await stockOf('with-the-gs');

  const placed = await post('/api/shop/orders', validOrder());
  check(placed.res.status === 201, 'order accepted', `status ${placed.res.status}`);
  const order = placed.body.order ?? {};
  check(/^7H-SHOP-[A-Z0-9]{6}$/.test(order.id ?? ''), 'readable order reference', String(order.id));
  check(order.records === 3, 'three records in the bag', String(order.records));
  check(order.subtotal === 38 + 44, 'subtotal is the sum of the lines', `$${order.subtotal}`);
  check(order.shipping === 3, 'Kampala courier charged', `$${order.shipping}`);
  check(order.total === 85, 'total is subtotal + delivery', `$${order.total}`);
  check(order.totals?.total?.ugx === 85 * 3750, 'UGX total at the configured rate', String(order.totals?.total?.ugx));
  check(order.status === 'placed', 'order starts as placed', String(order.status));
  check(order.payment?.status === 'pending', 'payment starts pending', String(order.payment?.status));
  check(Boolean(order.payment?.reference), 'mobile money reference issued', String(order.payment?.reference));
  check(order.delivery?.address === 'Plot 12 Bukoto Street, Kamwokya', 'address kept for the courier');
  check(
    Boolean(order.totals) && /^ai•+@example\.test$/.test(order.buyer?.email ?? ''),
    'client view masks the buyer email',
    String(order.buyer?.email),
  );
  check(/^\+256 ••• 78$/.test(order.buyer?.phone ?? ''), 'client view masks the phone', String(order.buyer?.phone));

  check(
    (await stockOf('made-in-entebbe')) === beforeBadman - 1,
    'stock decremented for the LP',
    `${beforeBadman} → ${await stockOf('made-in-entebbe')}`,
  );
  check(
    (await stockOf('with-the-gs')) === beforeSingle - 2,
    'stock decremented for the 7"',
    `${beforeSingle} → ${await stockOf('with-the-gs')}`,
  );

  const deskMail = emails().filter((entry) => (entry.body?.to ?? []).includes('desk@7h.test'));
  const receiptMail = emails().filter((entry) => (entry.body?.to ?? []).includes('aisha@example.test'));
  check(deskMail.length === 1, 'the desk is emailed the order', `${deskMail.length}`);
  check(receiptMail.length === 1, 'the buyer gets a receipt email', `${receiptMail.length}`);
  check(
    /SHOP ORDER/.test(String(deskMail[0]?.body?.text ?? '')),
    'desk email reads as a shop order',
    String(deskMail[0]?.body?.subject ?? '').slice(0, 60),
  );
  check(
    /thank you for your order/i.test(String(receiptMail[0]?.body?.text ?? '')),
    'receipt thanks the buyer and explains payment',
  );
  check(whatsapps().length === 1, 'management gets one WhatsApp', `${whatsapps().length}`);
  check(
    /shop order/i.test(String(whatsapps()[0]?.body?.text?.body ?? '')),
    'WhatsApp names the sale',
    String(whatsapps()[0]?.body?.text?.body ?? '').slice(0, 50),
  );

  const tracked = await json(`/api/shop/orders/${order.id}`);
  check(tracked.res.ok && tracked.body.order?.id === order.id, 'fan can re-open their order by reference');
  check(tracked.body.order?.payment?.accountNumber, 'order page carries the payment number');

  /* --------------------------------------------------- overselling ---- */
  section('The shelf cannot be oversold');
  received.length = 0;

  const greedy = await post(
    '/api/shop/orders',
    validOrder({ items: [{ releaseId: 'badman', quantity: 99 }] }),
  );
  check(greedy.res.status === 422, 'quantity above the per-order cap is refused', `status ${greedy.res.status}`);

  // Put a record on a two-copy shelf, then try to buy three.
  await patch('/api/admin/shop/stock/badman', { stock: 2 }, adminHeaders);
  const tooMany = await post('/api/shop/orders', validOrder({ items: [{ releaseId: 'badman', quantity: 3 }] }));
  check(tooMany.res.status === 409, 'an impossible quantity is refused', `status ${tooMany.res.status} · ${tooMany.body.error}`);
  check(tooMany.body.code === 'out_of_stock', 'refusal names the stock problem', String(tooMany.body.code));
  check((await stockOf('badman')) === 2, 'a refused order does not touch stock', String(await stockOf('badman')));
  check(emails().length === 0, 'a refused order sends nothing', `${emails().length} email(s)`);
  await patch('/api/admin/shop/stock/badman', { stock: 35 }, adminHeaders);

  const unknown = await post('/api/shop/orders', validOrder({ items: [{ releaseId: 'not-a-record', quantity: 1 }] }));
  check(unknown.res.status === 422, 'an unknown record is refused', `status ${unknown.res.status}`);

  /* ------------------------------------------------------ bad input ---- */
  section('A half-filled checkout is caught field by field');
  const blank = await post('/api/shop/orders', {
    buyer: { name: '', email: 'nope', phone: '12' },
    items: [],
    delivery: { id: 'nonsense' },
    payment: { method: 'bitcoin' },
  });
  check(blank.res.status === 422, 'rejected', `status ${blank.res.status}`);
  check(blank.body.errors?.name, 'name error named');
  check(blank.body.errors?.email, 'email error named');
  check(blank.body.errors?.phone, 'phone error named');
  check(blank.body.errors?.delivery, 'delivery error named');
  check(blank.body.errors?.paymentMethod, 'payment error named');

  const noAddress = await post(
    '/api/shop/orders',
    validOrder({ delivery: { id: 'kampala', address: '', city: '' } }),
  );
  check(noAddress.res.status === 422 && noAddress.body.errors?.address, 'courier orders need an address');

  const noPickupAddress = await post(
    '/api/shop/orders',
    validOrder({
      items: [{ releaseId: 'proof-of-life', quantity: 1 }],
      delivery: { id: 'pickup', address: '', city: '' },
    }),
  );
  check(noPickupAddress.res.status === 201, 'studio pickup needs no address', `status ${noPickupAddress.res.status}`);

  /* --------------------------------------------------------- admin ---- */
  section('The console sees the sale and can move it along');
  const auth = { headers: adminHeaders };

  const console_ = await json('/api/admin/shop', auth);
  check(console_.res.ok, 'shop console loads', `status ${console_.res.status}`);
  check(console_.body.summary?.orders >= 1, 'orders listed', String(console_.body.summary?.orders));
  check(console_.body.summary?.awaitingPayment >= 1, 'unpaid orders counted', String(console_.body.summary?.awaitingPayment));
  check(
    console_.body.stock?.find((row) => row.releaseId === 'made-in-entebbe')?.sold === 1,
    'stock panel counts what sold',
    String(console_.body.stock?.find((row) => row.releaseId === 'made-in-entebbe')?.sold),
  );

  const paid = await patch(`/api/admin/shop/orders/${order.id}`, { paymentStatus: 'paid' }, auth.headers);
  check(paid.res.ok && paid.body.order?.payment?.status === 'paid', 'marked paid');
  check(Boolean(paid.body.order?.payment?.paidAt), 'payment time recorded');

  const revenue = await json('/api/admin/shop', auth);
  check(revenue.body.summary?.revenueUsd >= 85, 'revenue includes the paid order', `$${revenue.body.summary?.revenueUsd}`);

  const shipped = await patch(`/api/admin/shop/orders/${order.id}`, { status: 'shipped' }, auth.headers);
  check(shipped.res.ok && shipped.body.order?.status === 'shipped', 'moved to shipped');
  check(
    (shipped.body.order?.statusHistory ?? []).some((entry) => entry.status === 'shipped'),
    'status history records the move',
  );

  const bogus = await patch(`/api/admin/shop/orders/${order.id}`, { status: 'teleported' }, auth.headers);
  check(bogus.res.status === 422, 'unknown status rejected', `status ${bogus.res.status}`);

  /* ------------------------------------------------------- restock ---- */
  section('Stock can be corrected, and a cancellation returns records');
  const restocked = await patch('/api/admin/shop/stock/with-the-gs', { stock: 4 }, auth.headers);
  check(restocked.res.ok && restocked.body.stock === 4, 'stock set by hand', String(restocked.body.stock));
  check((await stockOf('with-the-gs')) === 4, 'the shop shows the new count');

  const lowStockShop = await json('/api/shop');
  check(
    lowStockShop.body.releases.find((release) => release.id === 'with-the-gs')?.lowStock === true,
    'shop flags a low shelf',
  );

  const second = await post('/api/shop/orders', validOrder({ items: [{ releaseId: 'with-the-gs', quantity: 2 }] }));
  check(second.res.status === 201, 'second order placed');
  check((await stockOf('with-the-gs')) === 2, 'stock drops to two');

  const cancelled = await patch(`/api/admin/shop/orders/${second.body.order.id}`, { status: 'cancelled' }, auth.headers);
  check(cancelled.res.ok && cancelled.body.order?.status === 'cancelled', 'order cancelled');
  check((await stockOf('with-the-gs')) === 4, 'cancelled records go back on the shelf');

  const cancelAgain = await patch(`/api/admin/shop/orders/${second.body.order.id}`, { status: 'cancelled' }, auth.headers);
  check(cancelAgain.res.status === 200 && cancelAgain.body.unchanged === true, 'cancelling twice does not double-restock');
  check((await stockOf('with-the-gs')) === 4, 'stock still four');

  const zeroed = await patch('/api/admin/shop/stock/pearl-of-africa', { stock: 0 }, auth.headers);
  check(zeroed.res.ok && zeroed.body.stock === 0, 'a record can be sold out');
  const soldOut = await json('/api/shop');
  check(
    soldOut.body.releases.find((release) => release.id === 'pearl-of-africa')?.soldOut === true,
    'shop marks it sold out',
  );
  const refuse = await post('/api/shop/orders', validOrder({ items: [{ releaseId: 'pearl-of-africa', quantity: 1 }] }));
  check(refuse.res.status === 409, 'sold-out record cannot be bought', `status ${refuse.res.status}`);
  check(refuse.body.code === 'out_of_stock', 'refusal names the stock problem', String(refuse.body.code));

  const unknownStock = await patch('/api/admin/shop/stock/not-a-record', { stock: 4 }, auth.headers);
  check(unknownStock.res.status === 404, 'cannot set stock on an unknown record');

  /* -------------------------------------------------- persistence ---- */
  section('The sale survives a restart of the store');
  // Writes are chained, so give the last snapshot a moment to land on disk.
  const readStore = async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const parsed = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'db.json'), 'utf8'));
      if (parsed.shop?.stock?.['with-the-gs'] === 4) return parsed;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'db.json'), 'utf8'));
  };
  const stored = await readStore();
  check(Array.isArray(stored.shop?.orders) && stored.shop.orders.length >= 3, 'shop orders persisted to disk');
  check(
    stored.shop.orders.find((entry) => entry.id === order.id)?.payment?.status === 'paid',
    'payment state persisted',
  );
  check(stored.shop.stock['with-the-gs'] === 4, 'stock persisted', String(stored.shop.stock['with-the-gs']));
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
