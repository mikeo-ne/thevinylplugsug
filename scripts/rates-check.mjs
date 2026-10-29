/**
 * Rates check — proves the money engine is automated, live and safe.
 *
 *   node scripts/rates-check.mjs
 *
 * No credentials and no real network: the two providers are replaced by a local
 * HTTP sink, so every failure mode can be exercised on purpose.
 *
 * What it locks down:
 *
 *   mapping      a country picks exactly one currency (Uganda unlocks UGX)
 *   arithmetic   conversion rounds once, and the parts still sum to the total
 *   flooring     a strong shilling never pushes UGX below the safety floor
 *   degradation  provider down → stale/ safety snapshot, never an exception
 *   caching      a warm cache does not re-hit the provider
 *   checkout     a dead forex feed cannot block or underquote an order
 *   route        GET /api/rates answers with a usable snapshot
 */
import http from 'node:http';

let pass = 0;
let fail = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
};
const section = (label) => console.log(`\n▸ ${label}`);

/* --------------------------------------------------------------- sink ---- */

const PORT = 4399;
const provider = {
  forex: { rates: { EUR: 0.92, GBP: 0.79 } },
  ugx: { result: 'success', rates: { UGX: 4359.5 } },
  forexStatus: 200,
  ugxStatus: 200,
  hits: { forex: 0, ugx: 0 },
};

const sink = http.createServer((req, res) => {
  const url = req.url ?? '';
  if (url.startsWith('/forex')) {
    provider.hits.forex++;
    res
      .writeHead(provider.forexStatus, { 'content-type': 'application/json' })
      .end(JSON.stringify(provider.forex));
    return;
  }
  if (url.startsWith('/ugx')) {
    provider.hits.ugx++;
    res.writeHead(provider.ugxStatus, { 'content-type': 'application/json' }).end(JSON.stringify(provider.ugx));
    return;
  }
  res.writeHead(404).end('{}');
});

await new Promise((resolve) => sink.listen(PORT, '127.0.0.1', resolve));

process.env.FX_API_URL = `http://127.0.0.1:${PORT}/forex`;
process.env.FX_UGX_API_URL = `http://127.0.0.1:${PORT}/ugx`;
process.env.FX_UGX_PER_USD = '4360';
delete process.env.FX_UGX_FLOOR;
process.env.FX_CACHE_SECONDS = '3600';
process.env.FX_STALE_SECONDS = '21600';
process.env.DATA_DIR = '/tmp/7h-rates-data';
process.env.UPLOAD_DIR = '/tmp/7h-rates-uploads';
process.env.STORE_DRIVER = 'file';

const currency = await import('../shared/currency.js');
const pricing = await import('../shared/pricing.js');
const rates = await import('../server/rates.js');

const {
  BASE_CURRENCY,
  SAFETY_UGX_PER_USD,
  convertFromUsd,
  currencyForCountry,
  currencyForDelivery,
  formatMoney,
  isDisplayCurrency,
} = currency;

/* ------------------------------------------------------------ mapping ---- */

section('Country → currency');
const cases = [
  ['Uganda', 'UGX'],
  ['uganda', 'UGX'],
  ['UG', 'UGX'],
  ['Kampala, Uganda', 'UGX'],
  ['Kenya', 'USD'],
  ['United Kingdom', 'GBP'],
  ['GB', 'GBP'],
  ['England', 'GBP'],
  ['Scotland', 'GBP'],
  ['Ireland', 'EUR'],
  ['Germany', 'EUR'],
  ['France', 'EUR'],
  ['Netherlands', 'EUR'],
  ['Portugal', 'EUR'],
  ['Spain', 'EUR'],
  ['United States', 'USD'],
  ['US', 'USD'],
  ['Canada', 'USD'],
  ['Nigeria', 'USD'],
  ['', 'USD'],
  ['Atlantis', 'USD'],
];
for (const [country, expected] of cases) {
  const actual = currencyForCountry(country);
  check(actual === expected, `${country || '(blank)'} → ${expected}`, actual === expected ? '' : `got ${actual}`);
}
check(BASE_CURRENCY === 'USD', 'the base currency is USD');
check(isDisplayCurrency('UGX') && isDisplayCurrency('EUR') && isDisplayCurrency('GBP'), 'switcher exposes UGX/EUR/GBP');
check(!isDisplayCurrency('KES') && !isDisplayCurrency('usd'), 'unknown/lower-case codes are refused');

check(currencyForDelivery({ zone: 'uganda' }) === 'UGX', 'a Uganda delivery locks UGX');
check(currencyForDelivery({ deliveryId: 'pickup' }) === 'UGX', 'Kampala pickup locks UGX');
check(currencyForDelivery({ zone: 'international', country: 'United Kingdom' }) === 'GBP', 'a UK address locks GBP');
check(currencyForDelivery({ zone: 'international', country: 'Germany' }) === 'EUR', 'a German address locks EUR');
check(currencyForDelivery({ zone: 'international', country: 'Brazil' }) === 'USD', 'elsewhere locks USD');

/* --------------------------------------------------------- arithmetic ---- */

section('Conversion & rounding');
const live = { USD: 1, UGX: 4360, EUR: 0.92, GBP: 0.79 };

check(convertFromUsd(56.25, 'UGX', live) === 245250, '1×LP at 4,360 → 245,250 UGX', String(convertFromUsd(56.25, 'UGX', live)));
check(convertFromUsd(3712.5, 'UGX', live) === 16186500, 'hero total → 16,186,500 UGX');
check(convertFromUsd(100, 'UGX', live) % 1 === 0, 'UGX never carries decimals');
check(convertFromUsd(52, 'EUR', live) === 47.84, '52 USD → 47.84 EUR');
check(convertFromUsd(52, 'GBP', live) === 41.08, '52 USD → 41.08 GBP');
check(convertFromUsd(52, 'USD', live) === 52, 'USD converts to itself');
check(convertFromUsd(0.005, 'EUR', live) === 0, 'sub-cent amounts round to zero, not to dust');
check(convertFromUsd(-10, 'USD', live) === 0, 'negative amounts are clamped');

check(formatMoney(245250, 'UGX') === 'UGX 245,250', 'UGX reads as a grouped integer', formatMoney(245250, 'UGX'));
check(formatMoney(52, 'USD') === '$52', 'whole dollars drop the cents', formatMoney(52, 'USD'));
check(formatMoney(48.1, 'EUR') === '€48.10', 'euros keep two decimals', formatMoney(48.1, 'EUR'));
check(formatMoney(41.2, 'GBP') === '£41.20', 'pounds keep two decimals', formatMoney(41.2, 'GBP'));

section('The parts still sum to the total');
for (const quantity of pricing.QUANTITIES) {
  const quote = pricing.calculateQuote({
    quantity,
    vinylTypeId: 'lp_standard',
    sleeveId: 'standard',
    fxRate: 4360,
  });
  const { totals } = quote;
  check(
    totals.factoryCost.ugx + totals.managementFee.ugx === totals.total.ugx,
    `${quantity} units: factory + 25% fee === total (UGX)`,
    `${totals.factoryCost.ugx} + ${totals.managementFee.ugx} vs ${totals.total.ugx}`,
  );
  check(
    totals.deposit.ugx + totals.balance.ugx === totals.total.ugx,
    `${quantity} units: deposit + balance === total (UGX)`,
  );
  check(
    Math.abs(totals.managementFee.usd - totals.total.usd * 0.2) < 0.01,
    `${quantity} units: the fee is still 25% of the USD total`,
  );
}

/* -------------------------------------------------------------- rates ---- */

section('Live snapshot');
rates.resetRatesCache();
let snapshot = await rates.getRates({ now: Date.now() });
check(snapshot.source === 'live', 'both providers healthy → source live', snapshot.source);
check(snapshot.rates.EUR === 0.92 && snapshot.rates.GBP === 0.79, 'EUR/GBP come from the forex provider');
check(snapshot.rates.UGX === 4360, 'the 4,359.5 quote is raised to the 4,360 floor', String(snapshot.rates.UGX));
check(snapshot.currency === undefined && snapshot.rates.USD === 1, 'USD is pinned to 1');
check(snapshot.currencies.includes('UGX') && snapshot.currencies.includes('EUR'), 'offered currencies include UGX/EUR');

section('Caching');
const before = { ...provider.hits };
await rates.getRates();
check(
  provider.hits.forex === before.forex && provider.hits.ugx === before.ugx,
  'a warm snapshot does not call the provider again',
  `${provider.hits.forex}/${provider.hits.ugx}`,
);

section('A strong shilling never underquotes');
provider.ugx = { result: 'success', rates: { UGX: 3900 } };
rates.resetRatesCache();
snapshot = await rates.getRates({ force: true });
check(snapshot.rates.UGX === 4360, 'a 3,900 quote is floored to 4,360', String(snapshot.rates.UGX));

process.env.FX_UGX_FLOOR = '4500';
rates.resetRatesCache();
snapshot = await rates.getRates({ force: true });
check(snapshot.rates.UGX === 4500, 'FX_UGX_FLOOR overrides the default floor', String(snapshot.rates.UGX));
delete process.env.FX_UGX_FLOOR;
provider.ugx = { result: 'success', rates: { UGX: 4359.5 } };

section('Degradation');
// Warm the cache, then let it expire and break both providers.
rates.resetRatesCache();
await rates.getRates({ now: 1_000_000 });
provider.forexStatus = 500;
provider.ugxStatus = 500;
const later = 1_000_000 + 3 * 3600 * 1000; // past the 1h TTL, inside the 6h stale window
const stale = await rates.getRates({ now: later });
check(stale.source === 'stale', 'an expired cache survives a provider outage', stale.source);
check(Math.round(stale.rates.UGX) === 4360, 'the stale snapshot keeps its floored shilling rate');

// Both feeds down with no usable cache → the safety table.
provider.forexStatus = 500;
provider.ugxStatus = 500;
rates.resetRatesCache();
snapshot = await rates.getRates({ force: true, now: Date.now() + 30 * 3600 * 1000 });
check(snapshot.source === 'safety', 'no provider and no cache → safety snapshot', snapshot.source);
check(snapshot.rates.UGX >= SAFETY_UGX_PER_USD, 'safety snapshot still quotes at the floor', String(snapshot.rates.UGX));
check(snapshot.rates.EUR === undefined, 'EUR is withheld rather than guessed');
check(snapshot.currencies.length === 2, 'the switcher falls back to USD + UGX only');

// One provider down is not an outage: a shilling quote still lands.
provider.forexStatus = 500;
provider.ugxStatus = 200;
rates.resetRatesCache();
snapshot = await rates.getRates({ force: true, now: Date.now() + 60 * 3600 * 1000 });
check(snapshot.source === 'partial', 'forex down but shilling up → partial, not an outage', snapshot.source);
check(Number(snapshot.rates.UGX) >= 4360, 'the partial snapshot still has a usable shilling rate');

provider.forexStatus = 200;
provider.ugxStatus = 200;

section('Checkout is never blocked');
rates.resetRatesCache();
const dead = await rates.currentUgxRate({ fetchImpl: () => Promise.reject(new Error('offline')), timeoutMs: 50 });
check(dead === 4360, 'a dead network falls back to the configured floor', String(dead));

rates.resetRatesCache();
const hanging = await rates.currentUgxRate({ fetchImpl: () => new Promise(() => {}), timeoutMs: 50 });
check(hanging === 4360, 'a hanging provider is abandoned after the timeout', String(hanging));

provider.ugx = { result: 'success', rates: { UGX: 4400 } };
rates.resetRatesCache();
const liveRate = await rates.currentUgxRate({ timeoutMs: 2000 });
check(liveRate === 4400, 'a healthy provider is used for the order', String(liveRate));

provider.ugx = { result: 'success', rates: { UGX: 4359.5 } };

/* -------------------------------------------------------------- route ---- */

section('GET /api/rates');
const express = (await import('express')).default;
const { default: api } = await import('../server/app.js');
const app = express();
app.use(api);
const appServer = http.createServer(app);
await new Promise((resolve) => appServer.listen(0, '127.0.0.1', resolve));
const appPort = appServer.address().port;

const response = await fetch(`http://127.0.0.1:${appPort}/api/rates`);
const body = await response.json();
check(response.status === 200, 'the route answers 200');
check(Boolean(body.source), 'the snapshot names its source', body.source);
check(Number(body.rates.UGX) >= 4360, 'the route never quotes below the floor', String(body.rates.UGX));
check(Array.isArray(body.currencies) && body.currencies.includes('USD'), 'the route advertises the switcher currencies');
check(typeof body.fetchedAt === 'string' && !Number.isNaN(Date.parse(body.fetchedAt)), 'the snapshot is timestamped');

// A quote is still denominated in USD, whatever the browser is showing.
const config = await (await fetch(`http://127.0.0.1:${appPort}/api/config`)).json();
check(config.currency?.base === 'USD', '/api/config states USD as the base');
check(config.currency?.safetyUgxRate >= 4360, 'the config exposes the safety floor', String(config.currency?.safetyUgxRate));

const quote = await (
  await fetch(`http://127.0.0.1:${appPort}/api/quote`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ quantity: 250, vinylTypeId: 'lp_standard', sleeveId: 'standard' }),
  })
).json();
const totalUsd = quote.quote?.total ?? quote.total;
const totalUgx = quote.quote?.totals?.total?.ugx ?? quote.totals?.total?.ugx;
check(typeof totalUsd === 'number' && totalUsd > 0, 'a quote is still priced in USD');
check(Math.round(totalUsd * (await rates.currentUgxRate())) === totalUgx || Math.abs(totalUsd * 4360 - totalUgx) <= 2, 'the quote shilling figure matches the rate', `${totalUsd} → ${totalUgx}`);

await new Promise((resolve) => appServer.close(resolve));
await new Promise((resolve) => sink.close(resolve));

console.log(`\n${fail === 0 ? '✓' : '✗'} rates: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
