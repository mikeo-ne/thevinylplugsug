/**
 * Currency: what we quote in, and how a destination decides it.
 *
 * One rule holds everything together: **USD is the base**. Factory costs, the
 * 25% management fee, deposits and the shop's catalogue prices are all stored
 * and charged in dollars, and a display currency is only ever a multiplication
 * of a dollar amount. Nothing is ever stored in shillings or euros, so a rate
 * moving can never change what an order actually costs.
 *
 * This module is shared by the browser and the API so the switcher, the
 * auto-detector and the server's totals agree on the same rules.
 */
import { DEFAULT_FX_UGX_PER_USD } from './pricing.js';

export const BASE_CURRENCY = 'USD';

/**
 * The rate we fall back to when no live quote can be had. It is deliberately set
 * a touch above the street rate: quoting too many shillings costs us a sale,
 * quoting too few costs us money on every order.
 */
export const SAFETY_UGX_PER_USD = DEFAULT_FX_UGX_PER_USD;

/** Currencies the switcher offers, in the order it offers them. */
export const DISPLAY_CURRENCIES = [
  { code: 'UGX', name: 'Ugandan shilling', short: 'Uganda', locale: 'en-UG', minorUnits: 0 },
  { code: 'USD', name: 'US dollar', short: 'Global', locale: 'en-US', minorUnits: 2 },
  { code: 'EUR', name: 'Euro', short: 'Europe', locale: 'en-IE', minorUnits: 2 },
  { code: 'GBP', name: 'Pound sterling', short: 'United Kingdom', locale: 'en-GB', minorUnits: 2 },
];

export const CURRENCY_CODES = DISPLAY_CURRENCIES.map((currency) => currency.code);

export const currencyMeta = (code) =>
  DISPLAY_CURRENCIES.find((currency) => currency.code === code) ?? DISPLAY_CURRENCIES[1];

export const isDisplayCurrency = (code) => CURRENCY_CODES.includes(code);

/* ------------------------------------------------------------------ *
 * Country → currency
 * ------------------------------------------------------------------ */

/** Uganda quotes and settles in shillings. */
const UGANDA = new Set(['UG', 'UGA', 'UGANDA']);

/** The United Kingdom, in the spellings people actually type. */
const UNITED_KINGDOM = new Set([
  'GB',
  'GBR',
  'UK',
  'UNITED KINGDOM',
  'GREAT BRITAIN',
  'BRITAIN',
  'ENGLAND',
  'SCOTLAND',
  'WALES',
  'NORTHERN IRELAND',
]);

/**
 * Europe → EUR.
 *
 * A deliberate simplification: Norway, Switzerland and Sweden have their own
 * currencies, but "Europe ships to a euro invoice" is a business decision, not a
 * bug — one price list, one bank account, one set of expectations.
 */
const EUROPE = new Set([
  'AT', 'AUSTRIA', 'BE', 'BELGIUM', 'BG', 'BULGARIA', 'HR', 'CROATIA', 'CY', 'CYPRUS',
  'CZ', 'CZECHIA', 'CZECH REPUBLIC', 'DK', 'DENMARK', 'EE', 'ESTONIA', 'FI', 'FINLAND',
  'FR', 'FRANCE', 'DE', 'GERMANY', 'GR', 'GREECE', 'HU', 'HUNGARY', 'IE', 'IRELAND',
  'IT', 'ITALY', 'LV', 'LATVIA', 'LT', 'LITHUANIA', 'LU', 'LUXEMBOURG', 'MT', 'MALTA',
  'NL', 'NETHERLANDS', 'HOLLAND', 'NO', 'NORWAY', 'PL', 'POLAND', 'PT', 'PORTUGAL',
  'RO', 'ROMANIA', 'SK', 'SLOVAKIA', 'SI', 'SLOVENIA', 'ES', 'SPAIN', 'SE', 'SWEDEN',
  'CH', 'SWITZERLAND', 'IS', 'ICELAND', 'EU', 'EUROPE', 'EUROPEAN UNION',
]);

const normalise = (value) => String(value ?? '').trim().toUpperCase().replace(/\./g, '');

/**
 * The currency for a destination country.
 * Empty or unknown countries fall back to USD, which is also the base.
 */
export function currencyForCountry(country) {
  const key = normalise(country);
  if (!key) return BASE_CURRENCY;

  // "Kampala, Uganda" and "London, United Kingdom" are as valid as "Uganda", so
  // try the whole field, then the comma-separated parts, then whole words.
  const candidates = [key, ...key.split(',').map((part) => part.trim())];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (UGANDA.has(candidate)) return 'UGX';
    if (UNITED_KINGDOM.has(candidate)) return 'GBP';
    if (EUROPE.has(candidate)) return 'EUR';
  }

  // Word-level fallback: names only, so a stray two-letter code inside an
  // address ("Plot 5, IT Lane") cannot pick a currency on its own.
  const words = key.split(/[^A-Z]+/).filter((word) => word.length > 2);
  for (const word of words) {
    if (UGANDA.has(word)) return 'UGX';
    if (UNITED_KINGDOM.has(word)) return 'GBP';
    if (EUROPE.has(word)) return 'EUR';
  }
  return BASE_CURRENCY;
}

/**
 * The currency implied by a checkout's delivery choice.
 *
 * Pressing orders carry a zone (`uganda` / `international`) and a country; shop
 * orders carry a delivery option (`pickup`, `kampala`, `world`, …). Both end up
 * here so a fan and a label see the same convention.
 */
export function currencyForDelivery({ zone, country, deliveryId } = {}) {
  if (deliveryId) {
    if (['pickup', 'kampala', 'uganda'].includes(deliveryId)) return 'UGX';
    if (deliveryId === 'east-africa') return BASE_CURRENCY;
  }
  if (zone === 'uganda') return 'UGX';
  if (zone && zone !== 'international') return currencyForCountry(country);
  return currencyForCountry(country);
}

/* ------------------------------------------------------------------ *
 * Conversion + formatting
 * ------------------------------------------------------------------ */

/**
 * Round to the currency's smallest unit — shillings have no cents.
 *
 * Negative amounts clamp to zero: a price below nothing is always a bug, and a
 * minus sign in a deposit box is the kind of bug that costs a customer.
 */
export const roundMoney = (amount, code) => {
  const meta = currencyMeta(code);
  const factor = 10 ** meta.minorUnits;
  const value = Number(amount) || 0;
  if (value <= 0) return 0;
  return Math.round(value * factor) / factor;
};

/**
 * Convert a USD amount into a display currency.
 *
 * Returns the *display* amount, rounded once at the end: the fee split is always
 * computed in dollars first, so the parts still add up to the total after
 * conversion (rounding each line separately is how invoices stop balancing).
 */
export function convertFromUsd(amountUsd, code, rates) {
  if (code === BASE_CURRENCY) return roundMoney(amountUsd, BASE_CURRENCY);
  const rate = Number(rates?.[code]);
  if (!Number.isFinite(rate) || rate <= 0) return roundMoney(amountUsd, BASE_CURRENCY);
  return roundMoney((Number(amountUsd) || 0) * rate, code);
}

/** `UGX 226,720` · `$52` · `€48.10` · `£41.20` */
export function formatMoney(amount, code = BASE_CURRENCY, { cents } = {}) {
  const meta = currencyMeta(code);
  const value = roundMoney(amount, code);
  const showCents = cents ?? (meta.minorUnits > 0 && Math.abs(value % 1) > 0.0001);

  if (code === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: showCents ? 2 : 0,
      maximumFractionDigits: showCents ? 2 : 0,
    }).format(value);
  }

  const digits = meta.minorUnits === 0 ? 0 : showCents ? 2 : 0;
  const compact = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

  if (code === 'EUR') return `€${compact}`;
  if (code === 'GBP') return `£${compact}`;
  return `${code} ${compact}`;
}

/** A short "1 USD = 4,360 UGX" line, for receipts and the console. */
export function describeRate(code, rates) {
  if (!code || code === BASE_CURRENCY) return 'Quoted in US dollars';
  const rate = Number(rates?.[code]);
  if (!Number.isFinite(rate)) return 'Rate unavailable';
  const meta = currencyMeta(code);
  const value = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: meta.minorUnits === 0 ? 0 : 2,
    maximumFractionDigits: meta.minorUnits === 0 ? 0 : 4,
  }).format(rate);
  return `1 USD = ${value} ${code}`;
}
