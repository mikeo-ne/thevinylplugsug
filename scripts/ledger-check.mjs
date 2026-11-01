/**
 * Payments ledger checks.
 *
 * The brief asked for a way of "organising these orders and payments made". The
 * ledger is derived rather than stored, so what has to be proved is that it says
 * the same thing the orders do — including the awkward states:
 *
 *   · a confirmed wallet collection is `collected`;
 *   · money a wallet took but nobody confirmed is `collected_unconfirmed`, and is
 *     NOT counted as collected revenue;
 *   · a prompt in flight is `pending`, not owed and not paid;
 *   · an order with nothing paid appears as `owed`, so the ledger doubles as a
 *     debtors list;
 *   · a hand-recorded deposit appears once, not twice;
 *   · retail sales are money too, and are labelled as a different pipeline;
 *   · filters narrow without changing the totals of what they narrowed to;
 *   · the CSV is a CSV (quoting, dates, no HTML).
 *
 * Run with `npm run test:ledger`.
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

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), '7h-ledger-'));
process.env.DATA_DIR = dataDir;
process.env.UPLOAD_DIR = dataDir;
process.env.NODE_ENV = 'test';
process.env.ADMIN_PASSCODE = '7HADMIN';
process.env.FORCE_FILE_STORE = 'true';
delete process.env.DATABASE_URL;
delete process.env.MOMO_SUBSCRIPTION_KEY;

const { db_, storeReady } = await import('../server/store.js');
await storeReady();
const { buildLedger, ledgerTotals, filterLedger, ledgerCsv } = await import('../server/ledger.js');
const { calculateQuote } = await import('../shared/pricing.js');

const express = (await import('express')).default;
const api = (await import('../server/app.js')).default;
const app = express();
app.use(api);
const server = http.createServer(app);
const port = await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const BASE = `http://127.0.0.1:${port}`;

const login = await fetch(`${BASE}/api/admin/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ passcode: '7HADMIN' }),
});
const { token } = await login.json();
const auth = { 'x-admin-token': token };

const quote = calculateQuote({ quantity: 250, vinylTypeId: 'lp_colored', sleeveId: 'gatefold', plantId: 'mobineko', fxRate: 4360 });

const seed = (id, overrides = {}) => {
  const order = {
    id,
    createdAt: new Date().toISOString(),
    status: 'received',
    client: { name: `Client ${id}`, email: `${id}@artist.test`, phone: '+256772000111', country: 'Uganda', deliveryType: 'uganda', recipientName: 'A', deliveryAddress: 'Plot 1', deliveryCity: 'Kampala', deliveryRegion: 'Central', deliveryPostalCode: '00256', notes: '' },
    configuration: { quantity: 250, vinylTypeId: 'lp_colored', sleeveId: 'gatefold', plantId: 'mobineko' },
    quote: { total: quote.total, deposit: quote.deposit, balance: quote.balance, fxRate: 4360, totals: quote.totals, vinylType: quote.vinylType, sleeve: quote.sleeve, plant: quote.plant },
    payment: { method: 'mtn_momo', payerPhone: '+256772000111', status: 'processing' },
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

console.log('\n▸ The awkward states, each labelled honestly');

seed('7H-LED-OWED');
seed('7H-LED-PENDING', {
  payment: {
    method: 'mtn_momo',
    status: 'processing',
    intents: [{ id: 'i1', provider: 'mtn_momo', status: 'pending', amountUgx: Math.round(quote.deposit * 4360), amountUsd: quote.deposit, referenceId: 'MOMO-111', requestedAt: new Date().toISOString() }],
  },
});
seed('7H-LED-CONFIRMED', {
  status: 'confirmed',
  payment: {
    method: 'mtn_momo',
    status: 'deposit_paid',
    depositPaidUsd: quote.deposit,
    paidAt: new Date().toISOString(),
    confirmedBy: 'console',
    intents: [{ id: 'i2', provider: 'mtn_momo', status: 'successful', paidUgx: Math.round(quote.deposit * 4360), amountUsd: quote.deposit, referenceId: 'MOMO-222', requestedAt: new Date().toISOString(), settledAt: new Date().toISOString(), confirmedDeposit: true }],
  },
});
seed('7H-LED-UNCONFIRMED', {
  payment: {
    method: 'airtel_money',
    status: 'processing',
    intents: [{ id: 'i3', provider: 'airtel_money', status: 'successful', paidUgx: Math.round(quote.deposit * 4360), amountUsd: quote.deposit, referenceId: 'AIRTEL-333', requestedAt: new Date().toISOString(), settledAt: new Date().toISOString() }],
  },
});
seed('7H-LED-FAILED', {
  payment: {
    method: 'mtn_momo',
    status: 'processing',
    intents: [{ id: 'i4', provider: 'mtn_momo', status: 'failed', amountUgx: Math.round(quote.deposit * 4360), amountUsd: quote.deposit, referenceId: 'MOMO-444', requestedAt: new Date().toISOString(), error: 'Declined by the wallet' }],
  },
});
seed('7H-LED-MANUAL', {
  payment: { method: 'card_bank', status: 'deposit_paid', depositPaidUsd: quote.deposit, paidAt: new Date().toISOString(), confirmedBy: 'console', confirmationNote: 'SWIFT received', reference: 'SWIFT-555' },
});

db_.data.shop = {
  ...(db_.data.shop ?? {}),
  stock: {},
  orders: [
    {
      id: '7H-SHOP-1',
      createdAt: new Date().toISOString(),
      status: 'placed',
      buyer: { name: 'Fan One', email: 'fan@test', phone: '+256700000000' },
      records: 2,
      total: 104,
      totals: { total: { usd: 104, ugx: 453440 } },
      payment: { method: 'mtn_momo', status: 'paid', reference: 'SHOP-777', paidAt: new Date().toISOString() },
    },
  ],
};
db_.save();

const rows = buildLedger(db_.data);
const find = (orderId) => rows.filter((row) => row.orderId === orderId);

check('an unpaid order appears as owed', find('7H-LED-OWED').some((row) => row.status === 'owed'));
check('…with the deposit figure', Math.abs((find('7H-LED-OWED')[0]?.amountUsd ?? 0) - quote.deposit) < 0.01);
check('a prompt in flight is pending, not owed', find('7H-LED-PENDING').every((row) => row.status === 'pending'));
check('a confirmed collection is collected', find('7H-LED-CONFIRMED').some((row) => row.status === 'collected'));
check('…and names who confirmed it', find('7H-LED-CONFIRMED')[0]?.confirmedBy === 'console');
check(
  'a wallet collection nobody confirmed is its own state',
  find('7H-LED-UNCONFIRMED').some((row) => row.status === 'collected_unconfirmed'),
  JSON.stringify(find('7H-LED-UNCONFIRMED').map((row) => row.status)),
);
check('…and is not counted as revenue', ledgerTotals(rows).awaitingUsd > 0);
check('a failed prompt is failed', find('7H-LED-FAILED').some((row) => row.status === 'failed'));
check('…and still shows the order as owing', find('7H-LED-FAILED').some((row) => row.status === 'owed'));
check('a hand-recorded deposit is one row', find('7H-LED-MANUAL').length === 1, String(find('7H-LED-MANUAL').length));
check('…marked collected', find('7H-LED-MANUAL')[0]?.status === 'collected');
check('…with its bank reference', find('7H-LED-MANUAL')[0]?.reference === 'SWIFT-555');
check('a retail sale is a different pipeline', find('7H-SHOP-1')[0]?.kind === 'shop');
check('…and counts as collected money', find('7H-SHOP-1')[0]?.status === 'collected');

console.log('\n▸ The totals add up');

const totals = ledgerTotals(rows);
const sumOf = (status) =>
  Math.round(rows.filter((row) => row.status === status).reduce((sum, row) => sum + row.amountUsd, 0) * 100) / 100;
check('collectedUsd matches the collected rows', Math.abs(totals.collectedUsd - sumOf('collected')) < 0.02, `${totals.collectedUsd} vs ${sumOf('collected')}`);
check('owedUsd matches the owed rows', Math.abs(totals.owedUsd - sumOf('owed')) < 0.02);
check('awaitingUsd is separate from collected', Math.abs(totals.awaitingUsd - sumOf('collected_unconfirmed')) < 0.02);
check('the counts agree with the rows', totals.counts.collected === rows.filter((row) => row.status === 'collected').length);
check('this month is a subset of collected', totals.thisMonthUsd <= totals.collectedUsd + 0.01);
check('newest first', new Date(rows[0].at).getTime() >= new Date(rows[rows.length - 1].at).getTime());

console.log('\n▸ Filters narrow, and the totals follow');

const owedOnly = filterLedger(rows, { status: 'owed' });
check('filtering by state keeps only that state', owedOnly.every((row) => row.status === 'owed'));
check('…and its totals describe the filter', Math.abs(ledgerTotals(owedOnly).owedUsd - totals.owedUsd) < 0.02);
check('filtering by pipeline works', filterLedger(rows, { kind: 'shop' }).every((row) => row.kind === 'shop'));
check('an empty window is empty, not everything', filterLedger(rows, { from: '2000-01-01', to: '2000-01-02' }).length === 0);

console.log('\n▸ The CSV is a spreadsheet, not a screenshot');

const csv = ledgerCsv(rows);
const lines = csv.trim().split('\n');
check('one header line', lines[0].startsWith('date,pipeline,order,client'));
check('one line per row', lines.length === rows.length + 1, `${lines.length} vs ${rows.length + 1}`);
check('no markup', !/<|>/.test(csv));
check('amounts are numbers', /,\d+(\.\d+)?,/.test(csv));
const risky = ledgerCsv([{ ...rows[0], client: 'Name, with "quotes"\nand a newline' }]);
check('a comma in a name is quoted', risky.includes('"Name, with ""quotes""'));
check('…newlines too, so a row stays one record', risky.includes('and a newline"'));
check('…and the header is still the first line', risky.trim().split('\n')[0].startsWith('date,pipeline'));

console.log('\n▸ The endpoint and its guard');

const response = await fetch(`${BASE}/api/admin/payments`, { headers: auth });
const payload = await response.json();
check('the ledger is served', response.status === 200);
check('…with rows', Array.isArray(payload.rows) && payload.rows.length >= rows.length);
check('…and totals', typeof payload.totals?.collectedUsd === 'number');
const filtered = await (await fetch(`${BASE}/api/admin/payments?status=owed`, { headers: auth })).json();
check('…and filters', filtered.rows.every((row) => row.status === 'owed'));
check('…keeping the unfiltered totals for context', filtered.grandTotals.collectedUsd >= filtered.totals.collectedUsd);
check('strangers cannot read it', (await fetch(`${BASE}/api/admin/payments`)).status === 401);

const csvResponse = await fetch(`${BASE}/api/admin/payments.csv`, { headers: auth });
const csvBody = await csvResponse.text();
check('the CSV downloads', csvResponse.status === 200 && /text\/csv/.test(csvResponse.headers.get('content-type') ?? ''));
check('…as an attachment with a date', /attachment; filename="7h-payments-\d{4}-\d{2}-\d{2}\.csv"/.test(csvResponse.headers.get('content-disposition') ?? ''), csvResponse.headers.get('content-disposition'));
check('…containing the seeded orders', csvBody.includes('7H-LED-CONFIRMED'));

const empty = await (await fetch(`${BASE}/api/admin/payments?status=failed&kind=shop`, { headers: auth })).json();
check('a filter with nothing in it returns nothing', empty.rows.length === 0 && empty.totals.collectedUsd === 0);

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
