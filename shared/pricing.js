/**
 * 7H Music Group — shared quoting engine.
 *
 * This module is imported by both the Express API (server) and the React client
 * so a quote can never drift between what the client sees and what the backend
 * commits to the pressing plant.
 */

/**
 * USD → UGX rate used to show every local price.
 *
 * This is the number the business actually converts at: quotes, the 25% fee, the
 * 50% deposit, the shop's shelf prices and the console totals all multiply by
 * it, so it must sit at or above the street rate — a weaker shilling must never
 * turn a quoted dollar price into a loss. Last reviewed 2026-10-29.
 * Override with FX_UGX_PER_USD on the server (and in Vercel) without a deploy.
 */
export const DEFAULT_FX_UGX_PER_USD = 4360;

export const MANAGEMENT_FEE_RATE = 0.25;
export const DEPOSIT_RATE = 0.5;

/** @typedef {1 | 25 | 50 | 100 | 250 | 500 | 1000} Quantity */

/**
 * Run sizes we quote. The ladder runs from a one-off lathe cut to a plant run,
 * so an artist can start with a single dubplate and grow into a pressing.
 */
export const QUANTITIES = /** @type {Quantity[]} */ ([1, 25, 50, 100, 250, 500, 1000]);

/** Display metadata for the quantity ladder (name + one-line note). */
export const QUANTITY_TIERS = [
  { quantity: 1, name: 'Lathe cut', note: '1-of-1 dubplate' },
  { quantity: 25, name: 'Micro-run', note: 'Boutique minimum' },
  { quantity: 50, name: 'Boutique', note: 'Short-run pressing' },
  { quantity: 100, name: 'Short run', note: 'Factory minimum' },
  { quantity: 250, name: 'Popular', note: 'Best value' },
  { quantity: 500, name: 'Volume', note: 'Album campaign' },
  { quantity: 1000, name: 'Plant run', note: 'Lowest per unit' },
];

export const DEFAULT_QUANTITY = 250;

/**
 * Per-unit pressing prices. Small runs carry a real premium: a lathe cut is cut
 * one record at a time, a 25-unit micro-run pays for plates it can never
 * amortise, and the price falls all the way down to a 1000-unit plant run.
 */
export const VINYL_TYPES = [
  {
    id: 'lp_standard',
    code: '12LP-STD',
    name: '12" LP Standard',
    shortName: '12" LP',
    tagline: '140g black vinyl',
    description:
      'Classic 140g black pressing with full-colour labels. The industry default for debut albums and reissues.',
    setupFee: 450,
    setup: { 1: 0, 25: 160, 50: 210 },
    unit: { 1: 45.0, 25: 14.5, 50: 11.2, 100: 8.5, 250: 6.2, 500: 5.1, 1000: 4.35 },
    turnaround: '8–10 weeks',
    badge: null,
  },
  {
    id: 'lp_colored',
    code: '12LP-CLR',
    name: '12" Colored',
    shortName: '12" Colour',
    tagline: '140g colour / splatter',
    description:
      'Statement vinyl in translucent colour or splatter. Limited-run collector appeal with premium centre labels.',
    setupFee: 520,
    setup: { 1: 0, 25: 185, 50: 240 },
    unit: { 1: 45.0, 25: 16.8, 50: 13.4, 100: 10.2, 250: 7.6, 500: 6.3, 1000: 5.4 },
    turnaround: '9–11 weeks',
    badge: 'Most requested',
  },
  {
    id: 'seven_single',
    code: '07EP-STD',
    name: '7" Single',
    shortName: '7" Single',
    tagline: '45rpm two-track',
    description:
      'Classic 45rpm 7-inch for singles and drops. Fast turnaround, perfect for radio campaigns and DJ promos.',
    setupFee: 380,
    setup: { 1: 0, 25: 130, 50: 175 },
    unit: { 1: 38.0, 25: 12.4, 50: 9.3, 100: 6.4, 250: 4.9, 500: 4.1, 1000: 3.45 },
    turnaround: '7–9 weeks',
    badge: null,
  },
];

export const SLEEVE_OPTIONS = [
  {
    id: 'standard',
    code: 'JKT-STD',
    name: 'Standard Jacket',
    shortName: 'Standard jacket',
    description: 'Full-colour printed board jacket with shrink wrap.',
    perUnit: 0,
  },
  {
    id: 'gatefold',
    code: 'JKT-GATE',
    name: 'Gatefold',
    shortName: 'Gatefold',
    description: 'Deluxe double-panel gatefold sleeve with spine print.',
    perUnit: 2.2,
  },
  {
    id: 'inner',
    code: 'JKT-INNER',
    name: 'Printed Inner Sleeve',
    shortName: 'Printed inner',
    description: 'Standard jacket plus a full-colour printed inner sleeve.',
    perUnit: 1.1,
  },
];

/**
 * The pressing plants and lathe houses we broker with.
 *
 * `moq` is the smallest run the plant will take (a lathe house takes one, a
 * plant-run house needs 250), `maxQuantity` caps plants that only do boutique
 * work, and `priceFactor` is their rate card relative to our base quote.
 * `ordersEmail` is where the automated spec sheet lands after a deposit.
 */
export const PRESSING_PLANTS = [
  {
    id: 'mobineko',
    name: 'Mobineko',
    country: 'Taiwan',
    region: 'Japan / Taiwan · worldwide fulfilment',
    kind: 'pressing',
    moq: 25,
    maxQuantity: null,
    priceFactor: 1,
    leadTime: '9–11 weeks',
    note: 'Colour vinyl, gatefold and consolidated freight to Kampala.',
    ordersEmail: process.env.PLANT_MOBINEKO_EMAIL ?? null,
  },
  {
    id: 'greenlakes',
    name: 'Green Lakes Pressing',
    country: 'Lithuania',
    region: 'Lithuania · eco vinyl & express',
    kind: 'pressing',
    moq: 100,
    maxQuantity: null,
    priceFactor: 1.06,
    leadTime: '7–10 weeks',
    note: 'Recycled compound vinyl, bio-wrap, fastest EU dispatch.',
    ordersEmail: process.env.PLANT_GREENLAKES_EMAIL ?? null,
  },
  {
    id: 'seabass',
    name: 'Seabass Vinyl',
    country: 'United Kingdom',
    region: 'UK · independent boutique pressing',
    kind: 'pressing',
    moq: 50,
    maxQuantity: null,
    priceFactor: 1.12,
    leadTime: '8–12 weeks',
    note: 'Small-batch UK pressing with hand-checked test presses.',
    ordersEmail: process.env.PLANT_SEABASS_EMAIL ?? null,
  },
  {
    id: 'drdub',
    name: 'Dr. Dub',
    country: 'Austria',
    region: 'Austria · 1-of-1 lathe cuts & DJ dubplates',
    kind: 'lathe',
    moq: 1,
    maxQuantity: 10,
    priceFactor: 1,
    leadTime: '3–5 weeks',
    note: 'Lathe cut one record at a time — our only route below 25 units.',
    ordersEmail: process.env.PLANT_DRDUB_EMAIL ?? null,
  },
  {
    id: 'gzmedia',
    name: 'GZ Media',
    country: 'Czech Republic',
    region: 'Czech Republic · industrial high-volume leader',
    kind: 'pressing',
    moq: 250,
    maxQuantity: null,
    priceFactor: 0.94,
    leadTime: '8–10 weeks',
    note: 'Largest pressing capacity in Europe — the cheapest per unit at volume.',
    ordersEmail: process.env.PLANT_GZMEDIA_EMAIL ?? null,
  },
  {
    id: 'deepgrooves',
    name: 'Deepgrooves',
    country: 'Netherlands',
    region: 'Netherlands · 100% green energy audiophile',
    kind: 'pressing',
    moq: 100,
    maxQuantity: null,
    priceFactor: 1.08,
    leadTime: '9–12 weeks',
    note: 'Audiophile-grade plating on 100% green energy, Dutch pressing.',
    ordersEmail: process.env.PLANT_DEEPGROOVES_EMAIL ?? null,
  },
];

export const DEFAULT_PLANT_ID = 'mobineko';

/** @param {unknown} value */
const toNumber = (value) => (typeof value === 'number' ? value : Number(value));

/** @param {number} amount */
export const roundMoney = (amount) => Math.round((amount + Number.EPSILON) * 100) / 100;

/** @param {string} id */
export const findVinylType = (id) => VINYL_TYPES.find((type) => type.id === id) ?? null;

/** @param {string} id */
export const findSleeve = (id) => SLEEVE_OPTIONS.find((option) => option.id === id) ?? null;

/** @param {string} id */
export const findPlant = (id) => PRESSING_PLANTS.find((plant) => plant.id === id) ?? null;

/** Setup, plates and test press for a given run length (lathe cuts include it). */
export function setupFeeFor(vinylType, quantity) {
  if (!vinylType) return 0;
  const qty = toNumber(quantity);
  const tiered = vinylType.setup?.[qty];
  return typeof tiered === 'number' ? tiered : vinylType.setupFee;
}

/** Can this plant take a run of this size? */
export const plantSupportsQuantity = (plant, quantity) => {
  if (!plant) return false;
  const qty = toNumber(quantity);
  if (!Number.isFinite(qty) || qty <= 0) return false;
  if (qty < plant.moq) return false;
  if (typeof plant.maxQuantity === 'number' && qty > plant.maxQuantity) return false;
  return true;
};

/** Every plant that will quote this run size, cheapest rate card first. */
export const plantsForQuantity = (quantity) =>
  PRESSING_PLANTS.filter((plant) => plantSupportsQuantity(plant, quantity)).sort(
    (a, b) => a.priceFactor - b.priceFactor,
  );

/**
 * Pick the plant for a quote: honour the client's choice when that plant takes
 * the run, otherwise fall back to the cheapest plant that does. The caller can
 * tell whether we had to move them via `adjusted`.
 */
export function resolvePlant(plantId, quantity) {
  const requested = findPlant(plantId);
  if (requested && plantSupportsQuantity(requested, quantity)) {
    return { plant: requested, adjusted: false };
  }
  const candidates = plantsForQuantity(quantity);
  const fallback = candidates[0] ?? null;
  return { plant: fallback, adjusted: Boolean(fallback && requested) , requested };
}

/**
 * Build the full commercial breakdown for a configuration.
 * @param {object} input
 * @param {number} input.quantity
 * @param {string} input.vinylTypeId
 * @param {string} input.sleeveId
 * @param {string} [input.plantId]
 * @param {number} [input.fxRate]
 */
export function calculateQuote({
  quantity,
  vinylTypeId,
  sleeveId,
  plantId = DEFAULT_PLANT_ID,
  fxRate = DEFAULT_FX_UGX_PER_USD,
}) {
  const vinylType = findVinylType(vinylTypeId);
  const sleeve = findSleeve(sleeveId);
  const qty = toNumber(quantity);
  const rate = toNumber(fxRate) > 0 ? toNumber(fxRate) : DEFAULT_FX_UGX_PER_USD;

  const errors = [];
  if (!vinylType) errors.push('Unknown vinyl type.');
  if (!sleeve) errors.push('Unknown sleeve option.');
  if (!Number.isFinite(qty) || qty <= 0) errors.push('Quantity must be a positive number.');

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const unitPrice = vinylType.unit[qty] ?? null;
  if (unitPrice === null) {
    return { valid: false, errors: [`Quantity ${qty} is not offered for ${vinylType.name}.`] };
  }

  const { plant, adjusted: plantAdjusted, requested: requestedPlant } = resolvePlant(plantId, qty);
  if (!plant) {
    return {
      valid: false,
      errors: [`No plant on our panel presses ${qty} units. Try a larger run.`],
    };
  }

  const plantFactor = plant.priceFactor ?? 1;
  const pressingCost = roundMoney(unitPrice * qty);
  const sleeveCost = roundMoney(sleeve.perUnit * qty);
  const setupCost = roundMoney(setupFeeFor(vinylType, qty));

  // A plant's rate card is applied to the pressing itself, never to the sleeve
  // upgrade or the 7H fee.
  const plantAdjustment = roundMoney((pressingCost + setupCost) * (plantFactor - 1));
  const factoryCost = roundMoney(pressingCost + setupCost + plantAdjustment + sleeveCost);
  const managementFee = roundMoney(factoryCost * MANAGEMENT_FEE_RATE);
  const total = roundMoney(factoryCost + managementFee);
  const deposit = roundMoney(total * DEPOSIT_RATE);
  const balance = roundMoney(total - deposit);

  return {
    valid: true,
    errors: [],
    quantity: qty,
    vinylType,
    sleeve,
    plant,
    plantAdjusted,
    requestedPlant: requestedPlant ? requestedPlant.id : null,
    fxRate: rate,
    lines: {
      pressingCost,
      sleeveCost,
      setupCost,
      plantAdjustment,
      plantFactor,
      unitPrice: roundMoney(unitPrice),
      sleevePerUnit: roundMoney(sleeve.perUnit),
    },
    factoryCost,
    managementFee,
    managementFeeRate: MANAGEMENT_FEE_RATE,
    total,
    perUnit: roundMoney(total / qty),
    deposit,
    balance,
    depositRate: DEPOSIT_RATE,
    currency: 'USD',
    // Shilling lines are derived from the USD total, not rounded independently:
    // the fee is the difference between the two, so the itemised bill adds up to
    // the shilling total to the last shilling (rounding three lines separately is
    // how an invoice ends up a few shillings short).
    totals: (() => {
      const totalUgx = Math.round(total * rate);
      const factoryUgx = Math.round(factoryCost * rate);
      const depositUgx = Math.round(deposit * rate);
      return {
        factoryCost: { usd: factoryCost, ugx: factoryUgx },
        managementFee: { usd: managementFee, ugx: totalUgx - factoryUgx },
        total: { usd: total, ugx: totalUgx },
        deposit: { usd: deposit, ugx: depositUgx },
        balance: { usd: balance, ugx: totalUgx - depositUgx },
        perUnit: { usd: roundMoney(total / qty), ugx: Math.round((total / qty) * rate) },
      };
    })(),
  };
}

/** Machine-readable specs forwarded to the plant. */
export function describeConfiguration({ quantity, vinylTypeId, sleeveId, plantId }) {
  const vinylType = findVinylType(vinylTypeId);
  const sleeve = findSleeve(sleeveId);
  const plant = findPlant(plantId) ?? null;
  return {
    quantity,
    vinyl: vinylType ? `${vinylType.name} (${vinylType.code})` : vinylTypeId,
    sleeve: sleeve ? `${sleeve.name} (${sleeve.code})` : sleeveId,
    turnaround: vinylType?.turnaround ?? null,
    plant: plant ? `${plant.name} (${plant.region})` : plantId ?? null,
  };
}
