/**
 * Landed cost — the add-ons that used to be invisible.
 *
 * A pressing quote is not the plant's invoice. Between the two sit freight to
 * Kampala, import duty, clearance and VAT, and every one of them is charged in
 * cash before a record reaches the client. Until this module existed, those costs
 * were supposed to come out of the 25% fee — which they quietly did not, on any
 * run big enough to need a pallet. That is the "add-on prices as you input order
 * information" problem, and it is how an order that looked profitable arrives at
 * a loss.
 *
 * So they are costed explicitly, as pass-through lines, not hidden in a margin:
 *
 *   factory cost      what the plant charges (their quote)
 *   freight           weight × rate, to Kampala
 *   import duty       a percentage of the CIF value
 *   VAT               on CIF + duty
 *   clearance         a flat agent fee
 *   ------------------------------
 *   landed cost       the truth
 *   + management fee  7H's margin on the factory cost only
 *   = client total
 *
 * The rates are estimates, not law: every one of them is an environment variable,
 * the console shows the breakdown per order, and the plant desk records what a
 * real invoice actually said. Defaults are deliberately conservative (they assume
 * sea/consolidated freight and full duty), because guessing low is how the
 * business loses money and guessing high only costs a quote.
 */

/** kg per record, packed — the number freight is actually billed on. */
const WEIGHTS_KG = {
  // 140 g record + board jacket + inner + shrink + carton overhead.
  lp_standard: 0.27,
  lp_colored: 0.27,
  seven_single: 0.115,
};

/** Packaging that changes the shipped weight. */
const SLEEVE_WEIGHT_KG = {
  standard: 0,
  gatefold: 0.055,
  inner: 0.02,
};

export const LANDED_RATES = {
  /** USD per shipped kilogram by sea/consolidated freight (pallet-scale runs). */
  freightPerKg: Number(process.env.FREIGHT_USD_PER_KG ?? 3.2),
  /** A pallet's minimum charge, because freight is never free. */
  freightMinimumUsd: Number(process.env.FREIGHT_MIN_USD ?? 180),
  /** USD per kilogram by air courier — used for consignments under 20 kg. */
  courierPerKg: Number(process.env.FREIGHT_COURIER_USD_PER_KG ?? 11),
  /** Smallest courier consignment we are ever billed for. */
  courierMinimumUsd: Number(process.env.FREIGHT_COURIER_MIN_USD ?? 45),
  /** Consignments at or above this weight ship on a pallet, not a courier. */
  palletWeightKg: Number(process.env.FREIGHT_PALLET_KG ?? 20),
  /** Uganda import duty on the CIF value. */
  dutyRate: Number(process.env.IMPORT_DUTY_RATE ?? 0.1),
  /** VAT on CIF + duty. Set IMPORT_VAT_RATE=0 if 7H is VAT-registered and reclaims it. */
  vatRate: Number(process.env.IMPORT_VAT_RATE ?? 0.18),
  /** Clearing agent, documentation and haulage from the port (pallet). */
  clearanceUsd: Number(process.env.CLEARANCE_USD ?? 120),
  /** Clearing and courier handling for a small parcel. */
  courierClearanceUsd: Number(process.env.CLEARANCE_COURIER_USD ?? 45),
};

const round = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

/** How much a run actually weighs, cartons included. */
export function shippedWeightKg({ quantity, vinylTypeId, sleeveId }) {
  const qty = Math.max(0, Number(quantity) || 0);
  const perRecord = (WEIGHTS_KG[vinylTypeId] ?? 0.27) + (SLEEVE_WEIGHT_KG[sleeveId] ?? 0);
  // Cartons, dividers and pallet: about 6% on top of the records themselves.
  return Math.round(qty * perRecord * 1.06 * 1000) / 1000;
}

/**
 * Freight, duty, VAT and clearance for a run.
 *
 * Duty is charged on CIF (factory + freight), and VAT on CIF + duty, which is how
 * URA actually assesses it — not on the factory invoice alone.
 */
export function landedCost({ factoryCost, quantity, vinylTypeId, sleeveId, rates = LANDED_RATES }) {
  const factory = Math.max(0, Number(factoryCost) || 0);
  const weightKg = shippedWeightKg({ quantity, vinylTypeId, sleeveId });
  // A box of ten dubplates does not move by pallet, and it is not cleared by a
  // freight forwarder either: charge courier rates and a parcel-sized clearance.
  const pallet = weightKg >= rates.palletWeightKg;
  const freightUsd = round(
    pallet
      ? Math.max(rates.freightMinimumUsd, weightKg * rates.freightPerKg)
      : Math.max(rates.courierMinimumUsd, weightKg * rates.courierPerKg),
  );
  const cif = round(factory + freightUsd);
  const dutyUsd = round(cif * rates.dutyRate);
  const vatUsd = round((cif + dutyUsd) * rates.vatRate);
  const clearanceUsd = round(pallet ? rates.clearanceUsd : rates.courierClearanceUsd);
  const landedUsd = round(factory + freightUsd + dutyUsd + vatUsd + clearanceUsd);

  return {
    weightKg,
    mode: pallet ? 'sea' : 'courier',
    factoryCost: round(factory),
    freightUsd,
    dutyUsd,
    vatUsd,
    clearanceUsd,
    dutiesUsd: round(dutyUsd + vatUsd + clearanceUsd),
    /** Everything charged on top of the factory invoice. */
    addOnsUsd: round(freightUsd + dutyUsd + vatUsd + clearanceUsd),
    landedUsd,
    rates: { ...rates },
  };
}
