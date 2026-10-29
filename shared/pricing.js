/**
 * 7H Music Group — shared quoting engine.
 *
 * This module is imported by both the Express API (server) and the React client
 * so a quote can never drift between what the client sees and what the backend
 * commits to the pressing plant.
 */

/** Indicative UGX/USD rate. Override with FX_UGX_PER_USD on the server. */
export const DEFAULT_FX_UGX_PER_USD = 3750;

export const MANAGEMENT_FEE_RATE = 0.25;
export const DEPOSIT_RATE = 0.5;

/** @typedef {100 | 250 | 500} Quantity */

export const QUANTITIES = /** @type {Quantity[]} */ ([100, 250, 500]);

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
    unit: { 100: 8.5, 250: 6.2, 500: 5.1 },
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
    unit: { 100: 10.2, 250: 7.6, 500: 6.3 },
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
    unit: { 100: 6.4, 250: 4.9, 500: 4.1 },
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

export const PRESSING_PLANTS = [
  {
    id: 'mobineko',
    name: 'Mobineko',
    region: 'Japan · worldwide fulfilment',
    // Where the spec sheet is emailed when an order clears deposit. Leave blank
    // until the plant confirms the address; the console then shows the hand-off
    // as "needs an order address" instead of pretending it was sent.
    ordersEmail: process.env.PLANT_MOBINEKO_EMAIL ?? null,
  },
  {
    id: 'greenlakes',
    name: 'Green Lakes Pressing',
    region: 'USA · eco vinyl specialists',
    ordersEmail: process.env.PLANT_GREENLAKES_EMAIL ?? null,
  },
];

/** @param {unknown} value */
const toNumber = (value) => (typeof value === 'number' ? value : Number(value));

/** @param {number} amount */
export const roundMoney = (amount) => Math.round((amount + Number.EPSILON) * 100) / 100;

/** @param {string} id */
export const findVinylType = (id) => VINYL_TYPES.find((type) => type.id === id) ?? null;

/** @param {string} id */
export const findSleeve = (id) => SLEEVE_OPTIONS.find((option) => option.id === id) ?? null;

/**
 * Build the full commercial breakdown for a configuration.
 * @param {object} input
 * @param {number} input.quantity
 * @param {string} input.vinylTypeId
 * @param {string} input.sleeveId
 * @param {number} [input.fxRate]
 */
export function calculateQuote({ quantity, vinylTypeId, sleeveId, fxRate = DEFAULT_FX_UGX_PER_USD }) {
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

  const pressingCost = roundMoney(unitPrice * qty);
  const sleeveCost = roundMoney(sleeve.perUnit * qty);
  const setupCost = roundMoney(vinylType.setupFee);
  const factoryCost = roundMoney(pressingCost + sleeveCost + setupCost);
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
    fxRate: rate,
    lines: {
      pressingCost,
      sleeveCost,
      setupCost,
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
    totals: {
      factoryCost: { usd: factoryCost, ugx: Math.round(factoryCost * rate) },
      managementFee: { usd: managementFee, ugx: Math.round(managementFee * rate) },
      total: { usd: total, ugx: Math.round(total * rate) },
      deposit: { usd: deposit, ugx: Math.round(deposit * rate) },
      balance: { usd: balance, ugx: Math.round(balance * rate) },
      perUnit: { usd: roundMoney(total / qty), ugx: Math.round((total / qty) * rate) },
    },
  };
}

/** Machine-readable specs forwarded to the plant. */
export function describeConfiguration({ quantity, vinylTypeId, sleeveId }) {
  const vinylType = findVinylType(vinylTypeId);
  const sleeve = findSleeve(sleeveId);
  return {
    quantity,
    vinyl: vinylType ? `${vinylType.name} (${vinylType.code})` : vinylTypeId,
    sleeve: sleeve ? `${sleeve.name} (${sleeve.code})` : sleeveId,
    turnaround: vinylType?.turnaround ?? null,
  };
}
