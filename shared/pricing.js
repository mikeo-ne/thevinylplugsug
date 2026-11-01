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
import { PLANT_ADD_ONS, factoryCostForPlant } from './plant-costs.js';
import { landedCost } from './landed-cost.js';

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
    // Cost is $2.60/unit at the plant (see PLANT_ADD_ONS); priced above it.
    perUnit: 3.2,
  },
  {
    id: 'inner',
    code: 'JKT-INNER',
    name: 'Printed Inner Sleeve',
    shortName: 'Printed inner',
    description: 'Standard jacket plus a full-colour printed inner sleeve.',
    // Cost is $1.30/unit at the plant (see PLANT_ADD_ONS); priced above it.
    perUnit: 1.6,
  },
];

/**
 * The pressing plants and lathe houses we broker with.
 *
 * `moq` is the smallest run the plant will take (a lathe house takes one, a
 * plant-run house needs 250), `maxQuantity` caps plants that only do boutique
 * work, and `priceFactor` is their rate card relative to our base quote.
 *
 * `ordersEmail` is where the automated spec sheet is *sent*. When it points at
 * the 7H desk (all four of our active plants can be routed there), `repEmail` is
 * the plant's own inbox and is printed on the dispatch slip as the forwarding
 * target — so one inbox can triage without guessing who to forward to.
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
    /** The plant's own inbox — printed as the forwarding target when our
     *  dispatch address is really the 7H desk. */
    repEmail: process.env.PLANT_MOBINEKO_REP_EMAIL ?? 'web@mobineko.com',
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
    /** The plant's own inbox — printed as the forwarding target when our
     *  dispatch address is really the 7H desk. */
    repEmail: process.env.PLANT_GREENLAKES_REP_EMAIL ?? 'hi@greenlakespressing.com',
  },
  {
    id: 'seabass',
    name: 'Seabass Vinyl',
    country: 'United Kingdom',
    region: 'UK · independent boutique pressing',
    kind: 'pressing',
    // Was 50. Their FAQ (checked 2026-11-01) states a minimum order size of 100
    // units, so a 50-unit quote was promising something the plant will refuse.
    moq: 100,
    maxQuantity: null,
    priceFactor: 1.12,
    leadTime: '8–12 weeks',
    note: 'Small-batch UK pressing with hand-checked test presses.',
    ordersEmail: process.env.PLANT_SEABASS_EMAIL ?? null,
    /** The plant's own inbox — printed as the forwarding target when our
     *  dispatch address is really the 7H desk. */
    repEmail: process.env.PLANT_SEABASS_REP_EMAIL ?? 'orders@seabassvinyl.com',
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
    /** The plant's own inbox — printed as the forwarding target when our
     *  dispatch address is really the 7H desk. */
    repEmail: process.env.PLANT_DRDUB_REP_EMAIL ?? 'info@drdub.com',
  },
  {
    id: 'gzmedia',
    name: 'GZ Media',
    country: 'Czech Republic',
    region: 'Czech Republic · industrial high-volume leader',
    kind: 'pressing',
    // Was 250. GZ's own FAQ (checked 2026-11-01): minimum 300 pcs for vinyl.
    moq: 300,
    maxQuantity: null,
    priceFactor: 0.94,
    leadTime: '8–10 weeks',
    note: 'Largest pressing capacity in Europe — the cheapest per unit at volume.',
    ordersEmail: process.env.PLANT_GZMEDIA_EMAIL ?? null,
    /** The plant's own inbox — printed as the forwarding target when our
     *  dispatch address is really the 7H desk. */
    repEmail: process.env.PLANT_GZMEDIA_REP_EMAIL ?? 'gz@gzmedia.cz',
  },
  {
    id: 'deepgrooves',
    name: 'Deepgrooves',
    country: 'Netherlands',
    region: 'Netherlands · 100% green energy audiophile',
    kind: 'pressing',
    // Was 100. Deepgrooves state a minimum order of 200 records (checked 2026-11-01).
    moq: 200,
    maxQuantity: null,
    priceFactor: 1.08,
    leadTime: '9–12 weeks',
    note: 'Audiophile-grade plating on 100% green energy, Dutch pressing.',
    ordersEmail: process.env.PLANT_DEEPGROOVES_EMAIL ?? null,
    /** The plant's own inbox — printed as the forwarding target when our
     *  dispatch address is really the 7H desk. */
    repEmail: process.env.PLANT_DEEPGROOVES_REP_EMAIL ?? 'info@deepgrooves.eu',
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
/* ── the price floor ──────────────────────────────────────────────────────
 * Everything below turns the plants' own prices into our rate card.
 *
 * The rule the business runs on: a quote may never sit below the plant's price
 * plus the freight, duty, VAT and clearance it takes to land the records in
 * Kampala. So we price from the cost up rather than from a guessed rate card
 * down, and we hold every run size to the **most expensive plant that quotes
 * it** — if we sell a 250-unit run and the client's basket has to go to a UK
 * boutique, the price already covers that boutique.
 */

/** Round a unit price up to the next 5 cents, so a quote never rounds into a loss. */
export const ceilPrice = (value) => Math.ceil((Number(value) || 0) * 20 - 1e-9) / 20;

/** The reference basket we price every tier from. */
const REFERENCE_SLEEVE_ID = 'standard';

/** The plant's invoice for one basket at one plant. */
export function plantEstimate(plant, { quantity, vinylTypeId, sleeveId }) {
  return factoryCostForPlant(plant, { quantity, vinylTypeId, sleeveId });
}

/**
 * The cost floor for a basket: what it costs us to land it, and therefore what
 * it may never be sold below.
 */
export function costFloor({ quantity, vinylTypeId, sleeveId, plantId, fxRate = DEFAULT_FX_UGX_PER_USD }) {
  const qty = toNumber(quantity);
  const plant = findPlant(plantId);
  // A floor is only meaningful for a plant that will actually quote the run.
  if (!plant || !plantSupportsQuantity(plant, qty)) return null;
  const estimate = plantEstimate(plant, { quantity: qty, vinylTypeId, sleeveId });
  const landed = landedCost({
    factoryCost: estimate.factoryCost,
    quantity: qty,
    vinylTypeId,
    sleeveId,
  });
  const rate = toNumber(fxRate) > 0 ? toNumber(fxRate) : DEFAULT_FX_UGX_PER_USD;
  return {
    plantId: plant.id,
    plantName: plant.name,
    confidence: estimate.confidence,
    source: estimate.source,
    factoryCost: estimate.factoryCost,
    addOns: {
      freightUsd: landed.freightUsd,
      dutyUsd: landed.dutyUsd,
      vatUsd: landed.vatUsd,
      clearanceUsd: landed.clearanceUsd,
      total: landed.addOnsUsd,
    },
    landedUsd: landed.landedUsd,
    landedUgx: Math.round(landed.landedUsd * rate),
    weightKg: landed.weightKg,
    mode: landed.mode,
  };
}

/**
 * Every plant that will quote this basket, with its price and the landed cost.
 * Sorted by landed cost, so the cheapest source is first.
 */
export function floorComparison({ quantity, vinylTypeId, sleeveId }) {
  return plantsForQuantity(quantity)
    .map((plant) => costFloor({ quantity, vinylTypeId, sleeveId, plantId: plant.id }))
    .filter(Boolean)
    .sort((a, b) => a.landedUsd - b.landedUsd);
}

/** The highest landed cost among the plants that can press this basket. */
export function bindingFloor({ quantity, vinylTypeId, sleeveId }) {
  const rows = floorComparison({ quantity, vinylTypeId, sleeveId });
  if (rows.length === 0) return null;
  return rows.reduce((worst, row) => (row.landedUsd > worst.landedUsd ? row : worst), rows[0]);
}

/**
 * Our rate card, derived from the plants' prices.
 *
 * Pressing prices are the highest plant cost for that basket at that run size,
 * rounded up to the next 5 cents; plates, cutting and test presses are inside
 * those prices, so there is no separate setup fee any more. This is what makes
 * "no losses on any plant" structural rather than a promise.
 */
export function bindingFactoryCost({ quantity, vinylTypeId, sleeveId }) {
  const plants = plantsForQuantity(quantity);
  if (plants.length === 0) return null;
  return plants.reduce((worst, plant) => {
    const cost = factoryCostForPlant(plant, { quantity, vinylTypeId, sleeveId });
    return !worst || cost.factoryCost > worst.factoryCost ? cost : worst;
  }, null);
}

function buildRateCard() {
  const card = {};
  for (const type of VINYL_TYPES) {
    card[type.id] = { unit: {}, setup: {} };
    for (const quantity of QUANTITIES) {
      // The dearest plant's *invoice* — freight and duty are added once, in
      // calculateQuote, never baked in here.
      const factory = bindingFactoryCost({ quantity, vinylTypeId: type.id, sleeveId: REFERENCE_SLEEVE_ID });
      card[type.id].unit[quantity] = factory ? ceilPrice(factory.factoryCost / quantity) : 0;
      card[type.id].setup[quantity] = 0;
    }
  }
  return card;
}

const RATE_CARD = buildRateCard();

for (const type of VINYL_TYPES) {
  type.unit = RATE_CARD[type.id].unit;
  type.setup = RATE_CARD[type.id].setup;
  // The flat fallback fee is gone: plates are inside the plant's unit price.
  type.setupFee = 0;
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

  const pressingCost = roundMoney(unitPrice * qty);
  const sleeveCost = roundMoney(sleeve.perUnit * qty);
  const setupCost = roundMoney(setupFeeFor(vinylType, qty));
  const rateCardCost = roundMoney(pressingCost + setupCost + sleeveCost);

  // What the chosen plant will actually invoice us for this exact basket. The
  // rate card is built from the dearest plant, so this should sit at or below it;
  // when a plant's price runs ahead of the card we sell at the plant's number
  // rather than at the card, which is the whole point of the floor.
  const plantCost = plantEstimate(plant, { quantity: qty, vinylTypeId, sleeveId });
  const costBasis = roundMoney(Math.max(rateCardCost, plantCost.factoryCost));
  const plantUplift = roundMoney(costBasis - rateCardCost);

  // Freight, duty, VAT and clearance are charged on the plant's *actual*
  // invoice, not on our rate card — which is why a cheaper plant is worth more
  // margin to us without costing the client a shilling less.
  const landed = landedCost({ factoryCost: plantCost.factoryCost, quantity: qty, vinylTypeId, sleeveId });
  const margin = roundMoney(costBasis * MANAGEMENT_FEE_RATE);
  const managementFee = roundMoney(landed.addOnsUsd + margin);
  const total = roundMoney(costBasis + managementFee);
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
      plantAdjustment: 0,
      plantFactor: 1,
      /** Extra charged when the chosen plant prices above our rate card. */
      plantUplift,
      unitPrice: roundMoney(unitPrice),
      sleevePerUnit: roundMoney(sleeve.perUnit),
    },
    /** Plant invoice. Kept as `factoryCost` so existing documents still add up. */
    factoryCost: costBasis,
    managementFee,
    managementFeeRate: MANAGEMENT_FEE_RATE,
    total,
    perUnit: roundMoney(total / qty),
    deposit,
    balance,
    depositRate: DEPOSIT_RATE,
    currency: 'USD',
    /**
     * The cost model behind the price: the plant's own quote for this basket, the
     * landed add-ons, and the margin the fee carries once they are paid.
     */
    cost: {
      plant: {
        id: plant.id,
        name: plant.name,
        confidence: plantCost.confidence,
        source: plantCost.source,
        invoiceUsd: plantCost.factoryCost,
        perUnit: plantCost.perUnit,
      },
      rateCardUsd: rateCardCost,
      plantUplift,
      weightKg: landed.weightKg,
      mode: landed.mode,
      freightUsd: landed.freightUsd,
      dutyUsd: landed.dutyUsd,
      vatUsd: landed.vatUsd,
      clearanceUsd: landed.clearanceUsd,
      addOnsUsd: landed.addOnsUsd,
      landedUsd: landed.landedUsd,
      marginUsd: margin,
      /** Total above the plant's invoice: freight, taxes, clearance and margin. */
      grossMarginUsd: roundMoney(total - costBasis),
      netMarginUsd: roundMoney(total - landed.landedUsd),
      /** What the fee is as a share of the factory invoice, for the console. */
      effectiveFeeRate: roundMoney((managementFee / (costBasis || 1)) * 100) / 100,
      /** Never negative by construction — this is the guard, and the test asserts it. */
      clearsFloor: total >= landed.landedUsd,
    },
    // Shilling lines are derived from the USD total, not rounded independently:
    // the fee is the difference between the two, so the itemised bill adds up to
    // the shilling total to the last shilling (rounding three lines separately is
    // how an invoice ends up a few shillings short).
    totals: (() => {
      const totalUgx = Math.round(total * rate);
      const factoryUgx = Math.round(costBasis * rate);
      const depositUgx = Math.round(deposit * rate);
      return {
        factoryCost: { usd: costBasis, ugx: factoryUgx },
        managementFee: { usd: managementFee, ugx: totalUgx - factoryUgx },
        total: { usd: total, ugx: totalUgx },
        deposit: { usd: deposit, ugx: depositUgx },
        balance: { usd: balance, ugx: totalUgx - depositUgx },
        perUnit: { usd: roundMoney(total / qty), ugx: Math.round((total / qty) * rate) },
      };
    })(),
  };
}

/**
 * The comparison the business asked for: every plant's own price for the same
 * basket, next to what we charge, at every run size. Used by the console and by
 * `npm run test:floor`.
 */
export function priceReference({ vinylTypeId = 'lp_standard', sleeveId = 'standard' } = {}) {
  return QUANTITIES.map((quantity) => {
    const rows = floorComparison({ quantity, vinylTypeId, sleeveId });
    const quote = calculateQuote({ quantity, vinylTypeId, sleeveId, plantId: rows[0]?.plantId });
    const binding = rows[rows.length - 1] ?? null;
    return {
      quantity,
      ourPriceUsd: quote.valid ? quote.total : null,
      ourPerUnitUsd: quote.valid ? quote.perUnit : null,
      bindingFloorUsd: binding ? binding.landedUsd : null,
      lines: rows.map((row) => ({
        plantId: row.plantId,
        plantName: row.plantName,
        confidence: row.confidence,
        factoryUsd: row.factoryCost,
        landedUsd: row.landedUsd,
        landedPerUnitUsd: Math.round((row.landedUsd / quantity) * 100) / 100,
        /** Positive: we sell above that plant's landed cost. */
        coverUsd: quote.valid ? Math.round((quote.total - row.landedUsd) * 100) / 100 : null,
        clearsFloor: quote.valid ? quote.total >= row.landedUsd : false,
      })),
    };
  });
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
