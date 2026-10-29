/**
 * Verifies the run-size ladder, the plant panel and the dynamic per-unit maths.
 *
 * Part 1 exercises the shared quoting engine directly (the same module the
 * client bundle and the Express API import), part 2 boots the Vercel handler
 * and proves the API quotes and stores the chosen plant.
 *
 * Run with `npm run test:pricing`.
 */
import http from 'node:http';
import fs from 'node:fs';

import {
  QUANTITIES,
  QUANTITY_TIERS,
  VINYL_TYPES,
  PRESSING_PLANTS,
  calculateQuote,
  plantSupportsQuantity,
  plantsForQuantity,
  setupFeeFor,
} from '../shared/pricing.js';

const checks = [];
const check = (ok, message, detail = '') => {
  checks.push({ ok, message });
  console.log(`${ok ? '✓' : '✗'} ${message}${detail && !ok ? ` — ${detail}` : ''}`);
};

const money = (value) => Math.round(value * 100) / 100;

/* 1 ── the ladder -------------------------------------------------------- */
const expectedTiers = [1, 25, 50, 100, 250, 500, 1000];
check(
  JSON.stringify(QUANTITIES) === JSON.stringify(expectedTiers),
  'quantity tiers are 1, 25, 50, 100, 250, 500, 1000',
  String(QUANTITIES),
);
check(
  QUANTITY_TIERS.length === QUANTITIES.length &&
    QUANTITY_TIERS.every((tier, index) => tier.quantity === QUANTITIES[index] && tier.name && tier.note),
  'every tier carries a name and a note for the configurator',
);
check(
  QUANTITY_TIERS.find((tier) => tier.quantity === 1)?.name.toLowerCase().includes('lathe'),
  'the 1-unit tier is presented as a lathe cut',
);
check(
  QUANTITY_TIERS.find((tier) => tier.quantity === 25)?.name === 'Micro-run' &&
    QUANTITY_TIERS.find((tier) => tier.quantity === 50)?.name === 'Boutique',
  '25 and 50 units are the micro-run and boutique tiers',
);

/* 2 ── every format is priced at every tier ------------------------------ */
for (const vinylType of VINYL_TYPES) {
  const missing = QUANTITIES.filter((quantity) => typeof vinylType.unit[quantity] !== 'number');
  check(missing.length === 0, `${vinylType.name} is priced at all seven tiers`, missing.join(', '));

  const prices = QUANTITIES.map((quantity) => vinylType.unit[quantity]);
  const monotonic = prices.every((price, index) => index === 0 || price < prices[index - 1]);
  check(monotonic, `${vinylType.name} per-unit price falls as the run grows`, prices.join(' > '));
}

/* 3 ── the headline numbers the user asked for --------------------------- */
const standard = VINYL_TYPES.find((type) => type.id === 'lp_standard');
check(standard.unit[25] === 14.5, '25 units quotes at $14.50/ea', String(standard.unit[25]));
check(standard.unit[1] === 45.0, '1 unit quotes at $45.00/ea (dubplate)', String(standard.unit[1]));
check(standard.unit[1000] < standard.unit[500], '1,000 units is cheaper per record than 500');
check(
  VINYL_TYPES.filter((type) => type.id !== 'seven_single').every((type) => type.unit[1] === 45.0),
  'a 1-of-1 12" lathe cut is $45.00/ea on both the black and colour lines',
  VINYL_TYPES.map((type) => `${type.id}=${type.unit[1]}`).join(' '),
);

const one = calculateQuote({ quantity: 1, vinylTypeId: 'lp_standard', sleeveId: 'standard' });
check(one.valid, 'a 1-unit quote is valid');
check(one.lines.setupCost === 0, 'a lathe cut carries no separate plate/setup fee', String(one.lines.setupCost));
check(one.plant.id === 'drdub', 'a 1-unit run is routed to the lathe house', one.plant.name);
check(money(one.total) === money(45 * 1.25), '1-unit turnkey total is $45 + 25%', `$${one.total}`);
check(
  setupFeeFor(standard, 100) === standard.setupFee,
  'starting at 100 units falls back to the standard setup fee',
);

const micro = calculateQuote({ quantity: 25, vinylTypeId: 'lp_standard', sleeveId: 'standard' });
check(micro.valid && micro.lines.unitPrice === 14.5, '25-unit quote uses the $14.50 unit price');
check(
  micro.perUnit > calculateQuote({ quantity: 250, vinylTypeId: 'lp_standard', sleeveId: 'standard' }).perUnit,
  'a micro-run costs more per record all-in than a 250 run',
);

/* 4 ── the plant panel ---------------------------------------------------- */
const expectedPlants = [
  ['mobineko', 25],
  ['greenlakes', 100],
  ['seabass', 50],
  ['drdub', 1],
  ['gzmedia', 250],
  ['deepgrooves', 100],
];
check(PRESSING_PLANTS.length === 6, 'six plants are on the panel', String(PRESSING_PLANTS.length));
for (const [id, moq] of expectedPlants) {
  const plant = PRESSING_PLANTS.find((entry) => entry.id === id);
  check(Boolean(plant), `${id} is on the panel`);
  check(plant?.moq === moq, `${plant?.name ?? id} has MOQ ${moq}`, String(plant?.moq));
}
check(
  PRESSING_PLANTS.every((plant) => plant.region && plant.leadTime && plant.note && typeof plant.priceFactor === 'number'),
  'every plant documents its region, lead time, note and rate card',
);

check(plantSupportsQuantity(PRESSING_PLANTS[0], 25) && !plantSupportsQuantity(PRESSING_PLANTS[0], 1), 'Mobineko takes 25+ but not a single unit');
check(!plantSupportsQuantity(PRESSING_PLANTS.find((p) => p.id === 'gzmedia'), 100), 'GZ Media refuses a 100-unit run');
check(!plantSupportsQuantity(PRESSING_PLANTS.find((p) => p.id === 'drdub'), 250), 'Dr. Dub caps out before 250 units');
check(
  plantsForQuantity(1).map((plant) => plant.id).join() === 'drdub',
  'only Dr. Dub quotes a single unit',
  plantsForQuantity(1).map((plant) => plant.id).join(),
);

/* 5 ── choosing a plant changes the money -------------------------------- */
const atGz = calculateQuote({ quantity: 250, vinylTypeId: 'lp_colored', sleeveId: 'gatefold', plantId: 'gzmedia' });
const atMobineko = calculateQuote({ quantity: 250, vinylTypeId: 'lp_colored', sleeveId: 'gatefold', plantId: 'mobineko' });
check(atGz.plant.id === 'gzmedia', 'an eligible plant choice is honoured', atGz.plant.name);
check(atGz.total < atMobineko.total, 'GZ Media quotes cheaper at 250 than the base rate', `${atGz.total} vs ${atMobineko.total}`);
check(atGz.lines.plantAdjustment < 0, 'the negative rate-card adjustment is itemised', String(atGz.lines.plantAdjustment));
check(
  atGz.lines.sleeveCost === atMobineko.lines.sleeveCost,
  'the plant rate card never touches the sleeve upgrade',
);
check(
  money(atGz.factoryCost) ===
    money(atMobineko.lines.pressingCost * 0.94 + atMobineko.lines.setupCost * 0.94 + atMobineko.lines.sleeveCost),
  'rate card is applied to pressing + setup only',
  `${atGz.factoryCost}`,
);

const atSeabass = calculateQuote({ quantity: 50, vinylTypeId: 'lp_standard', sleeveId: 'standard', plantId: 'seabass' });
check(atSeabass.plant.id === 'seabass' && atSeabass.lines.plantAdjustment > 0, 'premium boutiques carry a positive adjustment');

const tooSmallForGz = calculateQuote({ quantity: 100, vinylTypeId: 'lp_standard', sleeveId: 'standard', plantId: 'gzmedia' });
check(tooSmallForGz.plant.id !== 'gzmedia', 'an ineligible plant is not silently used');
check(tooSmallForGz.plantAdjusted, 'the quote reports that the plant had to move');
check(tooSmallForGz.requestedPlant === 'gzmedia', 'the quote remembers which plant was asked for');
check(
  tooSmallForGz.plant.id === plantsForQuantity(100)[0].id,
  'the fallback plant is the cheapest one that takes the run',
  tooSmallForGz.plant.name,
);

check(
  calculateQuote({ quantity: 300, vinylTypeId: 'lp_standard', sleeveId: 'standard' }).valid === false,
  'an unlisted quantity is rejected',
);

const legacy = calculateQuote({ quantity: 250, vinylTypeId: 'lp_colored', sleeveId: 'gatefold' });
check(money(legacy.total) === 3712.5, 'the old 250 × 12" Colour gatefold total is unchanged', String(legacy.total));

/* 6 ── the API agrees ---------------------------------------------------- */
const PORT = 4191;
const BASE = `http://127.0.0.1:${PORT}`;
const TEST_DATA = '/tmp/7h-pricing-check';
const TEST_UPLOADS = '/tmp/7h-pricing-uploads';
fs.rmSync(TEST_DATA, { recursive: true, force: true });
fs.rmSync(TEST_UPLOADS, { recursive: true, force: true });

process.env.VERCEL = '1';
process.env.DATA_DIR = TEST_DATA;
process.env.UPLOAD_DIR = TEST_UPLOADS;
process.env.ADMIN_PASSCODE = 'PRICECHECK';
process.env.SESSION_SECRET = 'pricing-check-secret';

const { default: handler } = await import('../api/index.js');
const server = http.createServer(handler);
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

const post = async (path, body) => {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};

try {
  const config = await fetch(`${BASE}/api/config`).then((response) => response.json());
  check(config.quantities.length === 7, '/api/config serves seven tiers');
  check(config.quantityTiers?.length === 7, '/api/config serves tier names');
  check(config.plants?.length === 6, '/api/config serves six plants');
  check(
    config.plants.every((plant) => typeof plant.moq === 'number' && plant.region && plant.leadTime),
    'the plant panel ships MOQ, region and lead time to the browser',
  );

  const quoted = await post('/api/quote', {
    quantity: 25,
    vinylTypeId: 'lp_standard',
    sleeveId: 'standard',
    plantId: 'mobineko',
  });
  check(quoted.status === 200 && quoted.body.quote?.plant?.id === 'mobineko', '/api/quote honours plantId');
  check(quoted.body.quote?.lines?.unitPrice === 14.5, '/api/quote returns the micro-run unit price');

  const single = await post('/api/quote', {
    quantity: 1,
    vinylTypeId: 'lp_standard',
    sleeveId: 'standard',
    plantId: 'mobineko',
  });
  check(single.body.quote?.plant?.id === 'drdub', '/api/quote routes a 1-unit run to Dr. Dub');

  const order = await post('/api/orders', {
    client: {
      name: 'Ladder Check',
      email: 'ladder@7h.test',
      phone: '+256700999777',
      deliveryType: 'uganda',
      deliveryAddress: 'Plot 4 Kira Road',
      deliveryCity: 'Kampala',
      country: 'Uganda',
    },
    configuration: { quantity: 1000, vinylTypeId: 'lp_standard', sleeveId: 'standard' },
    payment: { method: 'mtn_momo' },
    plantPreference: 'gzmedia',
    audioLink: 'https://drive.google.com/master.wav',
    artworkLink: 'https://drive.google.com/art.pdf',
    termsAccepted: true,
  });
  check(order.status === 201, 'a 1,000-unit order is accepted', JSON.stringify(order.body?.error ?? ''));
  check(order.body.order?.configuration?.plantId === 'gzmedia', 'the order stores the chosen plant');
  check(order.body.order?.plantPreference === 'gzmedia', 'plantPreference matches the stored plant');
  check(order.body.order?.quote?.plant?.name === 'GZ Media', 'the order snapshot names the plant');
  check(
    money(order.body.order?.quote?.factoryCost) ===
      money(
        calculateQuote({
          quantity: 1000,
          vinylTypeId: 'lp_standard',
          sleeveId: 'standard',
          plantId: 'gzmedia',
        }).factoryCost,
      ),
    'the server total matches the shared engine',
  );

  const latheOrder = await post('/api/orders', {
    client: {
      name: 'Lathe Check',
      email: 'lathe@7h.test',
      phone: '+256700999666',
      deliveryType: 'uganda',
      deliveryAddress: 'Plot 4 Kira Road',
      deliveryCity: 'Kampala',
      country: 'Uganda',
    },
    configuration: { quantity: 1, vinylTypeId: 'lp_standard', sleeveId: 'standard' },
    payment: { method: 'mtn_momo' },
    plantPreference: 'gzmedia',
    audioLink: 'https://drive.google.com/master.wav',
    artworkLink: 'https://drive.google.com/art.pdf',
    termsAccepted: true,
  });
  check(latheOrder.status === 201, 'a 1-unit lathe order is accepted');
  check(
    latheOrder.body.order?.plantPreference === 'drdub',
    'a plant that cannot take 1 unit is corrected to Dr. Dub',
    latheOrder.body.order?.plantPreference,
  );
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
