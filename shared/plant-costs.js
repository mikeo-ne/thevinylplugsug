/**
 * What each plant actually charges for the basket we sell.
 *
 * Our rate card used to be a guess. It quoted $8.50/unit at 100 units while
 * Mobineko — our own main supplier — publishes US$1,285 for 100 × 12" black LPs,
 * i.e. $12.85 each before a single dollar of freight. Every 100-unit order was
 * therefore sold below the factory invoice, and the "freight and handling" line
 * only made it look covered.
 *
 * This module is that reference the other way round: for each plant, the price of
 * the exact basket the configurator builds — base press + colour + weight +
 * sleeve + labels + inners + plates/test press — at each run size. Our sell price
 * is then derived from it (see shared/pricing.js), so it cannot drift back down.
 *
 * Confidence is stated per plant and never disguised:
 *
 *   quoted      the plant published this number; we read it (dated below)
 *   modelled    no public price — derived from the quoted anchor by that plant's
 *               known position in the market (MOQ, country, volume capacity)
 *   estimate    a lathe house quoting per record
 *
 * A `modelled` row carries a safety factor, because guessing low is the failure
 * mode that loses money. When a plant answers a real quote request, update the
 * row here and the whole rate card moves with it.
 */

/** The quoted anchor: Mobineko's own published short-run price, per unit. */
const MOBINEKO_UNIT_12 = { 25: 26.0, 50: 17.6, 100: 12.85, 250: 9.3, 500: 7.4, 1000: 5.95 };

/**
 * Per-unit add-ons. These are the numbers that appear as you fill in a plant's
 * order form — colour vinyl, heavier vinyl, a gatefold, a printed inner — and
 * they are the ones that used to be ignored when we priced a run.
 */
export const PLANT_ADD_ONS = {
  /** Colour / splatter compound, per record. */
  colourPerUnit: 1.6,
  /** 180 g pressing instead of 140 g (kept for future weight options). */
  heavyPerUnit: 1.2,
  /** Gatefold jacket with spine print. */
  gatefoldPerUnit: 2.6,
  /** Printed inner sleeve. */
  innerPerUnit: 1.3,
  /** 7" pressing relative to a 12" LP of the same spec. */
  sevenFactor: 0.62,
  /** 5 test pressings, where a plant charges them separately. */
  testPressUsd: 0,
};

/**
 * The panel, with the price we hold each plant to.
 *
 * `unit12` is the per-unit price of a standard black 12" LP with a full-colour
 * jacket and printed labels. `index` scales the anchor for plants that do not
 * publish; `safety` is headroom for the ones we are modelling rather than quoting.
 */
export const PLANT_PRICE_DATA = {
  mobineko: {
    confidence: 'quoted',
    asOf: '2026-11-01',
    unit12: MOBINEKO_UNIT_12,
    index: 1,
    safety: 1,
    source:
      'Mobineko short-run vinyl: 100 pcs 12" black LP = US$1,285, cutting, plating and printing included (mobineko.com/short-run-vinyl).',
  },
  gzmedia: {
    confidence: 'modelled',
    asOf: '2026-11-01',
    index: 0.92,
    safety: 1.05,
    source:
      'GZ Media publish no public price list; modelled below the Mobineko anchor for their 300-unit minimum and European volume capacity.',
  },
  deepgrooves: {
    confidence: 'modelled',
    asOf: '2026-11-01',
    index: 1.06,
    safety: 1.05,
    source:
      'Deepgrooves calculator prices are computed in the browser (deepgrooves.eu/calculator/vinyl); modelled on the anchor plus an audiophile-plating premium. MOQ 200.',
  },
  greenlakes: {
    confidence: 'modelled',
    asOf: '2026-11-01',
    index: 1.1,
    safety: 1.05,
    source:
      'Green Lakes quote by web form only; modelled on the anchor plus a recycled-compound premium. MOQ 100.',
  },
  seabass: {
    confidence: 'modelled',
    asOf: '2026-11-01',
    index: 1.18,
    safety: 1.05,
    source:
      'Seabass Vinyl quote by form or email; modelled as the UK boutique premium over the anchor. MOQ 100.',
  },
  drdub: {
    confidence: 'estimate',
    asOf: '2026-11-01',
    unitLath: 37,
    index: 1,
    safety: 1.05,
    source:
      'Dr. Dub cut per record; modelled at US$37 per 12" dubplate from their shop pricing. One-off, so no volume curve.',
  },
};

const round = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

/** Per-unit factory price for a 12" black LP at this run size. */
function baseUnit(plantId, quantity, data) {
  if (data.unitLath) return data.unitLath;
  const table = data.unit12 ?? MOBINEKO_UNIT_12;
  if (table[quantity] != null) return table[quantity];
  // No published tier (e.g. GZ at 500 is quoted, but 300 is not): interpolate
  // along the anchor curve and round up, never down.
  const tiers = Object.keys(table).map(Number).sort((a, b) => a - b);
  const above = tiers.find((tier) => tier > quantity);
  const below = [...tiers].reverse().find((tier) => tier < quantity);
  if (above == null) return table[tiers[0]];
  if (below == null) return table[above];
  const upper = table[above];
  const lower = table[below];
  const span = above - below;
  return Math.ceil((lower + ((upper - lower) * (quantity - below)) / span) * 100) / 100;
}

/**
 * The plant's invoice for one basket, before freight.
 *
 * @param {object} plant  an entry from PRESSING_PLANTS
 * @param {{quantity:number, vinylTypeId:string, sleeveId:string}} basket
 */
export function factoryCostForPlant(plant, { quantity, vinylTypeId, sleeveId }) {
  const data = PLANT_PRICE_DATA[plant?.id] ?? null;
  const qty = Math.max(0, Number(quantity) || 0);
  const id = plant?.id ?? 'unknown';
  if (!data) {
    return {
      plantId: id,
      quantity: qty,
      factoryCost: 0,
      perUnit: 0,
      confidence: 'unknown',
      source: 'No price data for this plant.',
      lines: { base: 0, colour: 0, sleeve: 0, addOns: 0 },
    };
  }

  const unitBase = baseUnit(id, qty, data) * (data.index ?? 1);
  const formatFactor = vinylTypeId === 'seven_single' ? PLANT_ADD_ONS.sevenFactor : 1;
  const colourPerUnit = vinylTypeId === 'lp_colored' ? PLANT_ADD_ONS.colourPerUnit : 0;
  const sleevePerUnit =
    sleeveId === 'gatefold'
      ? PLANT_ADD_ONS.gatefoldPerUnit
      : sleeveId === 'inner'
        ? PLANT_ADD_ONS.innerPerUnit
        : 0;

  const perUnit = round((unitBase + colourPerUnit + sleevePerUnit) * formatFactor * (data.safety ?? 1));
  const base = round(unitBase * formatFactor * (data.safety ?? 1) * qty);
  const colour = round(colourPerUnit * formatFactor * (data.safety ?? 1) * qty);
  const sleeve = round(sleevePerUnit * formatFactor * (data.safety ?? 1) * qty);
  const testPressings = PLANT_ADD_ONS.testPressUsd;

  return {
    plantId: id,
    quantity: qty,
    perUnit,
    confidence: data.confidence,
    asOf: data.asOf,
    source: data.source,
    lines: { base, colour, sleeve, addOns: round(colour + sleeve + testPressings) },
    factoryCost: round(base + colour + sleeve + testPressings),
  };
}
