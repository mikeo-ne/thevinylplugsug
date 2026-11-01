/**
 * Invoice checks — the document in the middle of the 1 November workflow.
 *
 * The brief drew a chain: order → payment → invoice → WhatsApp → plant. The
 * invoice was the missing link, and an invoice is the one artefact in this system
 * where "close enough" is not acceptable:
 *
 *   · the number is issued once and never renumbered;
 *   · the client sees an all-in price, never the brokerage percentage;
 *   · the arithmetic on the page matches the arithmetic in the order;
 *   · the WhatsApp link carries the same reference the page does;
 *   · a brand-new order is never left without a document.
 *
 * Run with `npm run test:invoice`.
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), '7h-invoice-'));
process.env.DATA_DIR = dataDir;
process.env.UPLOAD_DIR = dataDir;
process.env.NODE_ENV = 'test';
process.env.ADMIN_PASSCODE = '7HADMIN';
process.env.PUBLIC_BASE_URL = 'https://7h.test';
process.env.FORCE_FILE_STORE = 'true';
delete process.env.DATABASE_URL;
// No WhatsApp Cloud API credentials: the suite proves click-to-chat is the state.
delete process.env.WHATSAPP_TOKEN;
delete process.env.WHATSAPP_PHONE_ID;

const { db_, storeReady } = await import('../server/store.js');
await storeReady();

const express = (await import('express')).default;
const api = (await import('../server/app.js')).default;
const app = express();
app.use(api);
const server = http.createServer(app);
const port = await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const BASE = `http://127.0.0.1:${port}`;

const { calculateQuote } = await import('../shared/pricing.js');

const login = await fetch(`${BASE}/api/admin/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ passcode: '7HADMIN' }),
});
const { token } = await login.json();
const auth = { 'x-admin-token': token };

const orderBody = (overrides = {}) => ({
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
  configuration: { quantity: 250, vinylTypeId: 'lp_colored', sleeveId: 'gatefold', plantId: 'mobineko' },
  payment: { method: 'mtn_momo', payerPhone: '+256772000111', payerName: 'Naledi Okello' },
  plantPreference: 'mobineko',
  audioLink: 'https://drive.example.com/naledi-master.wav',
  artworkLink: 'https://drive.example.com/naledi-art.pdf',
  termsAccepted: true,
  ...overrides,
});

const placeOrder = async (overrides = {}) => {
  const response = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(orderBody(overrides)),
  });
  const payload = await response.json();
  return { status: response.status, payload, order: payload.order };
};

const seedOrder = (overrides = {}) => {
  const quote = calculateQuote({
    quantity: 250,
    vinylTypeId: 'lp_colored',
    sleeveId: 'gatefold',
    plantId: 'mobineko',
    fxRate: 4360,
  });
  const order = {
    id: `7H-2026-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
    createdAt: new Date('2026-10-20T09:00:00.000Z').toISOString(),
    status: 'received',
    client: {
      name: 'Legacy Order',
      email: 'legacy@artist.test',
      phone: '+256772000222',
      country: 'Uganda',
      deliveryType: 'uganda',
      recipientName: 'Legacy Order',
      deliveryAddress: 'Kira Road',
      deliveryCity: 'Kampala',
      deliveryRegion: 'Central',
      deliveryPostalCode: '00256',
      notes: '',
    },
    configuration: { quantity: 250, vinylTypeId: 'lp_colored', sleeveId: 'gatefold', plantId: 'mobineko' },
    quote: {
      vinylType: quote.vinylType,
      sleeve: quote.sleeve,
      plant: quote.plant,
      factoryCost: quote.factoryCost,
      managementFee: quote.managementFee,
      managementFeeRate: quote.managementFeeRate,
      total: quote.total,
      deposit: quote.deposit,
      balance: quote.balance,
      perUnit: quote.perUnit,
      fxRate: 4360,
      totals: quote.totals,
      lines: quote.lines,
    },
    payment: { method: 'mtn_momo', payerPhone: '+256772000222', payerName: 'Legacy Order', status: 'processing' },
    plantPreference: 'mobineko',
    files: { audio: [], artwork: [], audioLink: null, artworkLink: null },
    statusHistory: [],
    ...overrides,
  };
  db_.data.orders.unshift(order);
  db_.save();
  return order;
};

/* ------------------------------------------------------------------ */

console.log('\n▸ A new order arrives with an invoice already numbered');

const first = await placeOrder();
check('the order is accepted', first.status === 201, `${first.status} ${JSON.stringify(first.payload).slice(0, 200)}`);

const firstId = first.order?.id;
check('it carries an invoice number', /^7H-INV-\d{4}$/.test(first.order?.invoice?.number ?? ''), first.order?.invoice?.number);

const second = await placeOrder({
  client: { ...orderBody().client, name: 'Second Artist', email: 'second@artist.test' },
});
check('the next order gets the next number', second.order?.invoice?.number === `7H-INV-${String(Number(first.order.invoice.number.slice(-4)) + 1).padStart(4, '0')}`, `${first.order?.invoice?.number} → ${second.order?.invoice?.number}`);
check('two orders never share a number', first.order?.invoice?.number !== second.order?.invoice?.number);

console.log('\n▸ The invoice page itself');

const page = await fetch(`${BASE}/api/orders/${firstId}/invoice`);
const html = await page.text();
check('it is served as HTML', page.status === 200 && (page.headers.get('content-type') ?? '').includes('text/html'), `${page.status} ${page.headers.get('content-type')}`);
check('…and never cached', (page.headers.get('cache-control') ?? '').includes('no-store'), page.headers.get('cache-control'));
check('…and never indexed', (page.headers.get('x-robots-tag') ?? '').includes('noindex'), page.headers.get('x-robots-tag'));
check('it names the invoice', html.includes(first.order.invoice.number), first.order.invoice.number);
check('…and the order', html.includes(firstId));
check('…and the client', html.includes('Naledi Okello'));
check('…and the plant', /Mobineko/.test(html));
check('…and the spec', html.includes('250') && /Gatefold/i.test(html));
check('it is a printable document', /@media print/.test(html) && /window\.print\(\)/.test(html));

console.log('\n▸ The client never sees the margin');

// Links are URL-encoded, and "$1,856.25%0A" is not a percentage — check the
// rendered text, not the href values.
const withoutHrefs = (source) => source.replace(/href="[^"]*"/g, 'href=""');
const visible = withoutHrefs(html);

check('no "management fee" line', !/management\s*fee/i.test(visible));
check('no 25% anywhere on the page', !/(?<![\d.])25\s*%/.test(visible));
check('no factory-cost line to reverse-engineer', !/factory cost/i.test(html));
check('the price is stated all-in', /all-in/i.test(html));
check('file checksums are on the page', /Master audio|Artwork/i.test(html));

console.log('\n▸ The arithmetic matches the order');

const quote = first.order.quote;
const usdText = (value) => `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
check('the all-in total is the order total', html.includes(usdText(quote.total)), usdText(quote.total));
check('the deposit is the order deposit', html.includes(usdText(quote.deposit)), usdText(quote.deposit));
check('a fresh order is stamped payment due', /PAYMENT DUE/.test(html));
check('…and asks for the deposit, not the whole total', /Still to pay/.test(html));

console.log('\n▸ The number is permanent');

const again = await fetch(`${BASE}/api/orders/${firstId}/invoice`);
await again.text();
await placeOrder({ client: { ...orderBody().client, name: 'Third Artist', email: 'third@artist.test' } });
const third = await (await fetch(`${BASE}/api/orders/${firstId}/invoice`)).text();
check('reopening it keeps the number', third.includes(first.order.invoice.number), first.order.invoice.number);
check('…even after other orders are issued', !third.includes(`7H-INV-${String(Number(first.order.invoice.number.slice(-4)) + 3).padStart(4, '0')}`));

const stored = db_.data.orders.find((order) => order.id === firstId);
check('the number is written to the order record', stored?.invoice?.number === first.order.invoice.number);
check('…and the counter moved past it', (db_.data.counters?.invoice ?? 0) >= Number(first.order.invoice.number.slice(-4)));

console.log('\n▸ Older orders are not left without a document');

const legacy = seedOrder();
check('a pre-invoice order has no number yet', legacy.invoice === undefined);
const legacyPage = await fetch(`${BASE}/api/orders/${legacy.id}/invoice`);
const legacyHtml = await legacyPage.text();
check('opening its invoice issues one', legacyPage.status === 200 && /7H-INV-\d{4}/.test(legacyHtml));
const legacyNumber = db_.data.orders.find((order) => order.id === legacy.id)?.invoice?.number;
check('…and stores it', /^7H-INV-\d{4}$/.test(legacyNumber ?? ''), legacyNumber);
check('…which is not one already issued', ![first.order.invoice.number, second.order.invoice.number].includes(legacyNumber), legacyNumber);

console.log('\n▸ A paid deposit rewrites the document, not the number');

const paid = seedOrder({
  client: { ...seedOrder().client, name: 'Paid Artist', email: 'paid@artist.test' },
  payment: {
    method: 'mtn_momo',
    payerPhone: '+256772000333',
    payerName: 'Paid Artist',
    status: 'deposit_paid',
    depositPaidUsd: calculateQuote({ quantity: 250, vinylTypeId: 'lp_colored', sleeveId: 'gatefold', plantId: 'mobineko', fxRate: 4360 }).deposit,
    paidAt: new Date().toISOString(),
    confirmedAt: new Date().toISOString(),
    confirmedBy: 'console',
    intents: [
      {
        id: 'intent_paid',
        provider: 'mtn_momo',
        status: 'successful',
        amountUgx: 28400000,
        paidUgx: 28400000,
        referenceId: 'MOMO-777888',
        requestedAt: new Date().toISOString(),
        settledAt: new Date().toISOString(),
        confirmedDeposit: true,
      },
    ],
  },
});
const paidHtml = await (await fetch(`${BASE}/api/orders/${paid.id}/invoice`)).text();
check('a paid order is stamped deposit paid', /DEPOSIT PAID/.test(paidHtml));
check('…it shows the balance, not "still to pay"', /Balance on dispatch/.test(paidHtml) && !/Still to pay/.test(paidHtml));
check('…the payment history carries the provider reference', paidHtml.includes('MOMO-777888'));
check(
  '…and no percentage fee slipped in',
  !/management\s*fee/i.test(withoutHrefs(paidHtml)) && !/(?<![\d.])25\s*%/.test(withoutHrefs(paidHtml)),
);

console.log('\n▸ WhatsApp hand-off, without any Meta credentials');

check('the page offers a wa.me link', /https:\/\/wa\.me\/\d{9,15}\?text=/.test(html));
const waMatch = html.match(/https:\/\/wa\.me\/\d+\?text=([^"']+)/);
const waMessage = waMatch ? decodeURIComponent(waMatch[1]) : '';
check('…pre-filled with the order reference', waMessage.includes(firstId), waMessage.slice(0, 120));
check('…and the invoice number', waMessage.includes(first.order.invoice.number));
check('…and the amount', waMessage.includes(usdText(quote.total)));
check('…with no raw newlines in the URL', !/\s/.test(waMatch?.[1] ?? ' '));

console.log('\n▸ The order API hands the client the document');

const view = await (await fetch(`${BASE}/api/orders/${firstId}`)).json();
check('the order view includes the invoice', view.order?.invoice?.number === first.order.invoice.number);
check(
  '…with its URL',
  (view.order?.invoice?.url ?? '').endsWith(`/api/orders/${firstId}/invoice`),
  view.order?.invoice?.url,
);
check('…its status', typeof view.order?.invoice?.status === 'string', view.order?.invoice?.status);
check('…and the money', view.order?.invoice?.amounts?.totalUsd === quote.total);
check('…including what is still owed', view.order?.invoice?.amounts?.outstandingUsd === quote.deposit);

console.log('\n▸ The console sees the margin the client does not');

const adminOrder = (await (await fetch(`${BASE}/api/admin/overview`, { headers: auth })).json()).orders.find(
  (order) => order.id === firstId,
);
check('the console carries the margin', typeof adminOrder?.margin?.managementFeeUsd === 'number');
check('…equal to the quote fee', adminOrder?.margin?.managementFeeUsd === quote.managementFee);
check('…and the invoice', adminOrder?.invoice?.number === first.order.invoice.number);

const adminInvoice = await fetch(`${BASE}/api/admin/orders/${firstId}/invoice`, { headers: auth });
check('the console can open the same invoice', adminInvoice.status === 200);
const noAuth = await fetch(`${BASE}/api/admin/orders/${firstId}/invoice`);
check('…but strangers cannot', noAuth.status === 401, String(noAuth.status));

console.log('\n▸ WhatsApp is click-to-chat, not a fault');

const system = await (await fetch(`${BASE}/api/admin/system`, { headers: auth })).json();
const wa = system.alerts?.verification?.find((entry) => entry.channel === 'whatsapp');
check('the channel is reported', Boolean(wa));
check('…as click-to-chat', wa?.mode === 'click_to_chat', wa?.mode);
check('…explicitly not a fault', wa?.notFault === true);
check('…with a detail that says what works', /click-to-chat/i.test(wa?.detail ?? ''), wa?.detail);
check('…and no "is not set up yet" phrasing', !/not set up yet/i.test(wa?.detail ?? ''));

const notFault = system.alerts?.verification
  ?.filter((entry) => entry.mode === 'click_to_chat')
  .map((entry) => entry.channel);
check('only WhatsApp uses the click-to-chat mode', notFault?.length === 1 && notFault[0] === 'whatsapp', JSON.stringify(notFault));

console.log('\n▸ Client-facing copy has no percentage fee in it');

const clientCopy = [
  'src/components/order/OrderSummary.tsx',
  'src/pages/SuccessPage.tsx',
  'src/components/landing/Configurator.tsx',
  'src/components/landing/Faq.tsx',
  'src/components/landing/Hero.tsx',
  'src/components/landing/Process.tsx',
];
for (const file of clientCopy) {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
    // Strip comments: the code explains *why* the rate exists, which is not copy.
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const visible = source.match(/(?:label|title|body|q|a)=?["'][^"']*25%[^"']*["']/g) ?? [];
  check(`${file} says nothing about a 25% fee`, visible.length === 0, visible.join(' | '));
}
check(
  'the console still shows the margin',
  /managementFee/.test(fs.readFileSync(path.join(root, 'src/pages/AdminPage.tsx'), 'utf8')),
);

console.log('\n▸ Things that must not happen');

const missing = await fetch(`${BASE}/api/orders/7H-NOPE/invoice`);
check('an unknown order is a clean 404', missing.status === 404, String(missing.status));
check('…in JSON, not a stack trace', (await missing.text()).includes('not found'));

const xss = await placeOrder({
  client: {
    ...orderBody().client,
    name: '<script>alert(1)</script>',
    email: 'xss@artist.test',
  },
});
const xssHtml = await (await fetch(`${BASE}/api/orders/${xss.order.id}/invoice`)).text();
check('client-supplied names are escaped', !xssHtml.includes('<script>alert(1)</script>'));
check('…but still readable', xssHtml.includes('&lt;script&gt;'));

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
