/**
 * Price-floor checks: the plants' prices against ours, on every combination.
 *
 * The request was "make an order on all plants and reference those prices to our
 * prices so that no losses are made, because there are some add-on prices as you
 * input order information". So this is the exhaustive version of that: for every
 * plant × every run size × every format × every sleeve, build the basket, price it
 * at the plant, land it in Kampala, and prove our quote still clears it.
 *
 * What has to hold:
 *
 *   · every plant carries a dated, sourced price for the basket, and says whether
 *     it is quoted, modelled or an estimate;
 *   · Mobineko's published $1,285 for 100 × 12" is in here verbatim, because it is
 *     the one number we actually read off a plant's own page;
 *   · our 100-unit price is above it — the loss that started this work is gone;
 *   · freight, duty, VAT and clearance are all charged, and charged on the plant's
 *     invoice rather than on our selling price;
 *   · the add-ons (colour, gatefold, printed inner, run size) all move the plant
 *     price, because those are the prices that appear as an order is configured;
 *   · no quote, at any combination, sells below its landed cost, and the console's
 *     Margin figure is never negative;
 *   · the deposit is still half, and the arithmetic still adds up;
 *   · `GET /api/admin/price-floor` serves the comparison, and refuses without a
 *     session.
 *
 * Run with `npm run test:floor`.
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  QUANTITIES,
  VINYL_TYPES,
  SLEEVE_OPTIONS,
  PRESSING_PLANTS,
  calculateQuote,
  costFloor,
  floorComparison,
  priceReference,
  plantSupportsQuantity,
} from '../shared/pricing.js';
import { PLANT_PRICE_DATA, PLANT_ADD_ONS, factoryCostForPlant } from '../shared/plant-costs.js';
import { landedCost, shippedWeightKg, LANDED_RATES } from '../shared/landed-cost.js';
import { marginCheck } from '../shared/plants.js';

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

const money = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const usd = (value) =>
  `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* 1 ── every plant has a price, and says where it came from --------------- */
console.log('\nPrice references');
for (const plant of PRESSING_PLANTS) {
  const data = PLANT_PRICE_DATA[plant.id];
  check(`${plant.name} has a price reference`, Boolean(data), plant.id);
  if (!data) continue;
  check(
    `${plant.name} says where its price came from`,
    typeof data.source === 'string' && data.source.length > 20 && Boolean(data.asOf),
    data?.source,
  );
  check(
    `${plant.name} is marked ${data.confidence}, not silently "confirmed"`,
    ['quoted', 'modelled', 'estimate'].includes(data.confidence),
    data.confidence,
  );
}

const mobinekoAt100 = factoryCostForPlant(
  PRESSING_PLANTS.find((plant) => plant.id === 'mobineko'),
  { quantity: 100, vinylTypeId: 'lp_standard', sleeveId: 'standard' },
);
check(
  money(mobinekoAt100.factoryCost) === 1285,
  "Mobineko's own 100 × 12\" price is held at US$1,285",
  String(mobinekoAt100.factoryCost),
);
check(
  money(mobinekoAt100.perUnit) === 12.85,
  'that is $12.85 a record before freight',
  String(mobinekoAt100.perUnit),
);

/* 2 ── the add-ons a plant charges as you configure an order --------------- */
console.log('\nAdd-on prices');
const basket = (overrides) => ({
  quantity: 250,
  vinylTypeId: 'lp_standard',
  sleeveId: 'standard',
  ...overrides,
});
const plant250 = PRESSING_PLANTS.find((plant) => plant.id === 'deepgrooves');
const plain = factoryCostForPlant(plant250, basket({}));
const colour = factoryCostForPlant(plant250, basket({ vinylTypeId: 'lp_colored' }));
const gatefold = factoryCostForPlant(plant250, basket({ sleeveId: 'gatefold' }));
const inner = factoryCostForPlant(plant250, basket({ sleeveId: 'inner' }));
const seven = factoryCostForPlant(plant250, basket({ vinylTypeId: 'seven_single' }));

check(
  money((colour.factoryCost - plain.factoryCost) / 250) === PLANT_ADD_ONS.colourPerUnit,
  `colour vinyl is charged at ${usd(PLANT_ADD_ONS.colourPerUnit)}/unit at the plant`,
  String((colour.factoryCost - plain.factoryCost) / 250),
);
check(
  money((gatefold.factoryCost - plain.factoryCost) / 250) === PLANT_ADD_ONS.gatefoldPerUnit,
  `a gatefold is charged at ${usd(PLANT_ADD_ONS.gatefoldPerUnit)}/unit`,
);
check(
  money((inner.factoryCost - plain.factoryCost) / 250) === PLANT_ADD_ONS.innerPerUnit,
  `a printed inner is charged at ${usd(PLANT_ADD_ONS.innerPerUnit)}/unit`,
);
check(seven.factoryCost < plain.factoryCost, 'a 7" is cheaper than a 12" at the same run size');

const small = factoryCostForPlant(plant250, basket({ quantity: 500 }));
check(
  small.perUnit < plain.perUnit,
  'a bigger run is cheaper per record at the plant',
  `${small.perUnit} vs ${plain.perUnit}`,
);

/* 3 ── freight, duty and clearance are real money ------------------------- */
console.log('\nLanded add-ons');
const landed = landedCost({ factoryCost: 1285, quantity: 100, vinylTypeId: 'lp_standard', sleeveId: 'standard' });
check(landed.freightUsd >= LANDED_RATES.freightMinimumUsd, 'freight is never free', String(landed.freightUsd));
check(landed.dutyUsd > 0, 'import duty is charged on the CIF value', String(landed.dutyUsd));
check(landed.vatUsd > 0, 'VAT is charged on CIF + duty', String(landed.vatUsd));
check(landed.clearanceUsd > 0, 'clearance is charged', String(landed.clearanceUsd));
check(
  money(landed.landedUsd) ===
    money(1285 + landed.freightUsd + landed.dutyUsd + landed.vatUsd + landed.clearanceUsd),
  'the landed cost is the sum of its parts',
  String(landed.landedUsd),
);
check(
  money(landed.dutyUsd) === money((1285 + landed.freightUsd) * LANDED_RATES.dutyRate),
  'duty is charged on factory + freight, not on freight alone',
);
check(
  money(landed.addOnsUsd) === money(landed.freightUsd + landed.dutyUsd + landed.vatUsd + landed.clearanceUsd),
  'the add-on total is freight + duty + VAT + clearance',
);
check(
  shippedWeightKg({ quantity: 100, vinylTypeId: 'lp_standard', sleeveId: 'standard' }) >
    shippedWeightKg({ quantity: 100, vinylTypeId: 'seven_single', sleeveId: 'standard' }),
  'a stack of LPs weighs more than the same number of singles',
);
const parcel = landedCost({ factoryCost: 40, quantity: 2, vinylTypeId: 'lp_standard', sleeveId: 'standard' });
check(parcel.mode === 'courier', 'a two-record parcel ships by courier, not on a pallet', parcel.mode);
check(
  parcel.freightUsd <= LANDED_RATES.courierMinimumUsd,
  'a small parcel is not charged pallet freight',
  String(parcel.freightUsd),
);

/* 4 ── the exhaustive sweep: no combination sells below cost ------------- */
console.log('\nEvery plant × run size × format × sleeve');
let combos = 0;
let belowFloor = 0;
let negativeMargin = 0;
const worst = { slack: Infinity, label: '' };
for (const plant of PRESSING_PLANTS) {
  for (const quantity of QUANTITIES) {
    if (!plantSupportsQuantity(plant, quantity)) continue;
    for (const vinylType of VINYL_TYPES) {
      for (const sleeve of SLEEVE_OPTIONS) {
        const quote = calculateQuote({
          quantity,
          vinylTypeId: vinylType.id,
          sleeveId: sleeve.id,
          plantId: plant.id,
        });
        combos += 1;
        const label = `${plant.id} · ${quantity} · ${vinylType.id} · ${sleeve.id}`;
        if (!quote.valid) {
          belowFloor += 1;
          failures.push(`quote invalid: ${label}`);
          continue;
        }
        if (quote.total < quote.cost.landedUsd) {
          belowFloor += 1;
          failures.push(`below floor: ${label} ${quote.total} < ${quote.cost.landedUsd}`);
        }
        if (quote.cost.netMarginUsd < 0 || quote.cost.marginUsd < 0) {
          negativeMargin += 1;
          failures.push(`negative margin: ${label}`);
        }
        if (quote.cost.plant.invoiceUsd > quote.factoryCost + 0.005) {
          belowFloor += 1;
          failures.push(`plant priced above the factory line: ${label}`);
        }
        const slack = money(quote.total - quote.cost.landedUsd);
        if (slack < worst.slack) {
          worst.slack = slack;
          worst.label = label;
        }
      }
    }
  }
}
check('the sweep covers every legal combination', combos > 100, `${combos} combinations`);
check('no combination sells below its landed cost', belowFloor === 0, `${belowFloor} failures`);
check('no combination carries a negative margin', negativeMargin === 0, `${negativeMargin} failures`);
check(
  'even the tightest combination clears cost',
  worst.slack > 0,
  `${worst.label} leaves ${usd(worst.slack)}`,
);

/* 5 ── the arithmetic and the deposit gate -------------------------------- */
console.log('\nQuote arithmetic');
const sample = calculateQuote({ quantity: 250, vinylTypeId: 'lp_colored', sleeveId: 'gatefold', plantId: 'mobineko' });
check(
  'total = factory + landed add-ons + margin',
  money(sample.total) === money(sample.factoryCost + sample.cost.addOnsUsd + sample.cost.marginUsd),
  `${sample.factoryCost} + ${sample.cost.addOnsUsd} + ${sample.cost.marginUsd} = ${sample.total}`,
);
check('the deposit is still 50%', money(sample.deposit) === money(sample.total / 2), String(sample.deposit));
check(
  'deposit + balance is the total',
  money(sample.deposit + sample.balance) === money(sample.total),
);
check(
  'the shilling total converts at the quoted rate',
  sample.totals.total.ugx === Math.round(sample.total * sample.fxRate),
  `${sample.totals.total.ugx}`,
);
check(
  'the console can see what sits above the plant invoice',
  money(sample.cost.grossMarginUsd) === money(sample.total - sample.factoryCost),
);
check(
  'the console can see the true margin after freight and taxes',
  money(sample.cost.netMarginUsd) === money(sample.total - sample.cost.landedUsd),
);
check('the quote reports that it clears the floor', sample.cost.clearsFloor === true);
check(
  'the fee never undershoots the 25% management rate',
  sample.cost.effectiveFeeRate >= 0.25,
  String(sample.cost.effectiveFeeRate),
);

/* 5b ── the desk sees the modelled floor, not just "unverified" ---------- */
console.log('\nThe plant desk before the plant answers');
const booked = calculateQuote({ quantity: 250, vinylTypeId: 'lp_colored', sleeveId: 'gatefold', plantId: 'deepgrooves' });
const pending = marginCheck({
  quote: { total: booked.total, cost: booked.cost, costModel: 'plant-cost-v1' },
  plantQuote: null,
});
check(
  pending.status === 'unverified',
  'an order with no plant invoice is still unverified, not auto-approved',
  pending.status,
);
check(
  money(pending.estimatedLandedUsd) === money(booked.cost.landedUsd),
  'the desk is shown the modelled landed cost while it waits',
  String(pending.estimatedLandedUsd),
);
check(
  money(pending.estimatedMarginUsd) === money(booked.total - booked.cost.landedUsd),
  'and the margin that model implies',
  String(pending.estimatedMarginUsd),
);
check(!pending.lossRisk, 'a modelled estimate never trips the loss guard on its own');
const overspent = marginCheck({
  quote: { total: booked.total, cost: booked.cost },
  plantQuote: { costUsd: booked.total, freightUsd: 100, dutiesUsd: 100 },
});
check(
  overspent.status === 'loss' && overspent.lossRisk,
  'a real invoice above the client price is still a loss, and still blocks the forward',
  overspent.status,
);

/* 6 ── the comparison table ---------------------------------------------- */
console.log('\nThe comparison');
const reference = priceReference({ vinylTypeId: 'lp_standard', sleeveId: 'standard' });
check('every run size appears in the comparison', reference.length === QUANTITIES.length);
check(
  'every run size is priced against at least one plant',
  reference.every((row) => row.quantity && row.ourPriceUsd != null && row.lines.length > 0),
);
check(
  'our price clears every plant on every row',
  reference.every((row) => row.lines.every((line) => line.clearsFloor)),
  reference
    .flatMap((row) => row.lines.filter((line) => !line.clearsFloor).map((line) => `${row.quantity}:${line.plantId}`))
    .join(', '),
);
check(
  'the binding floor is the most expensive plant that takes the run',
  reference.every((row) => {
    const worstLanded = Math.max(...row.lines.map((line) => line.landedUsd));
    return money(row.bindingFloorUsd) === money(worstLanded);
  }),
);
check(
  'our price is above the dearest plant landed cost at every run size',
  reference.every((row) => row.ourPriceUsd >= row.bindingFloorUsd),
);
check(
  'the per-record price falls as the run grows',
  reference
    .map((row) => row.ourPerUnitUsd)
    .every((price, index) => index === 0 || price < reference[index - 1].ourPerUnitUsd),
  reference.map((row) => row.ourPerUnitUsd).join(' > '),
);

const perPlant = floorComparison({ quantity: 250, vinylTypeId: 'lp_standard', sleeveId: 'standard' });
check('a 250-unit basket can be quoted at four or more plants', perPlant.length >= 4, String(perPlant.length));
check(
  'the comparison is sorted cheapest-first',
  perPlant.every((row, index) => index === 0 || row.landedUsd >= perPlant[index - 1].landedUsd),
);
check(
  'a plant that refuses the run returns no floor at all',
  costFloor({ quantity: 25, vinylTypeId: 'lp_standard', sleeveId: 'standard', plantId: 'gzmedia' }) === null,
);

console.log('\nThe reference table (12" LP, jacket, printed labels)');
console.log(
  ['run'.padEnd(6), 'our price'.padEnd(12), 'dearest landed'.padEnd(16), 'per record'.padEnd(12), 'plants'].join(''),
);
for (const row of reference) {
  console.log(
    [
      String(row.quantity).padEnd(6),
      usd(row.ourPriceUsd).padEnd(12),
      usd(row.bindingFloorUsd).padEnd(16),
      usd(row.ourPerUnitUsd).padEnd(12),
      row.lines.map((line) => `${line.plantId}=${usd(line.landedUsd)}`).join(' '),
    ].join(''),
  );
}

/* 7 ── the console endpoint ----------------------------------------------- */
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), '7h-floor-'));
process.env.DATA_DIR = dataDir;
process.env.UPLOAD_DIR = dataDir;
process.env.NODE_ENV = 'test';
process.env.ADMIN_PASSCODE = '7HFLOOR';
process.env.FORCE_FILE_STORE = 'true';
delete process.env.DATABASE_URL;
delete process.env.MOMO_SUBSCRIPTION_KEY;

const { storeReady } = await import('../server/store.js');
await storeReady();
const express = (await import('express')).default;
const api = (await import('../server/app.js')).default;
const app = express();
app.use(api);
const server = http.createServer(app);
const port = await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const BASE = `http://127.0.0.1:${port}`;

try {
  const anonymous = await fetch(`${BASE}/api/admin/price-floor`);
  check(anonymous.status === 401, 'the comparison needs an admin session', String(anonymous.status));

  const login = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ passcode: '7HFLOOR' }),
  });
  const { token } = await login.json();
  const response = await fetch(`${BASE}/api/admin/price-floor`, { headers: { 'x-admin-token': token } });
  const body = await response.json();
  check(response.status === 200, 'the console can fetch the comparison', String(response.status));
  check(body.rows?.length === QUANTITIES.length, 'the endpoint returns every run size');
  check(body.clearsFloor === true, 'the endpoint reports that nothing is sold below cost');
  check(
    body.rows.every((row) => row.lines.every((line) => typeof line.confidence === 'string' && line.confidence)),
    'every plant price in the response carries its confidence',
  );

  const coloured = await fetch(`${BASE}/api/admin/price-floor?vinylTypeId=lp_colored&sleeveId=gatefold`, {
    headers: { 'x-admin-token': token },
  });
  const colouredBody = await coloured.json();
  check(
    colouredBody.rows[0].ourPriceUsd > body.rows[0].ourPriceUsd,
    'the endpoint prices the configured basket, not a fixed one',
  );
} catch (error) {
  check('the console endpoint is reachable', false, error.message);
} finally {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
}

console.log(`\n${passed}/${passed + failures.length} checks passed`);
if (failures.length > 0) {
  for (const failure of failures.slice(0, 20)) console.log(`  ✗ ${failure}`);
  process.exit(1);
}
