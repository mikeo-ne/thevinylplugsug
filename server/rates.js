/**
 * Live exchange rates.
 *
 * What we ask for, and why two providers:
 *
 *  · **EUR / GBP** come from Frankfurter, which republishes the European Central
 *    Bank's daily reference rates — free, no key, no rate limit worth worrying
 *    about. The user-facing URL is `https://api.frankfurter.dev/v1/latest`.
 *  · **UGX** is not an ECB currency, so it is not in Frankfurter's table. The
 *    Ugandan shilling comes from a second free endpoint (open.er-api.com by
 *    default) and is **never allowed below the configured floor** — if the live
 *    number is lower than `FX_UGX_FLOOR` we quote the floor, because a strong
 *    shilling must not turn a dollar invoice into a loss.
 *
 * Failure behaviour, in order: the last good snapshot (up to `FX_STALE_SECONDS`
 * old) → the safety table (UGX at the floor, no EUR/GBP) → USD only. This module
 * never throws and never blocks a checkout.
 */
import { BASE_CURRENCY, DISPLAY_CURRENCIES, SAFETY_UGX_PER_USD } from '../shared/currency.js';
import { DEFAULT_FX_UGX_PER_USD } from '../shared/pricing.js';

const REQUEST_TIMEOUT = 4000;

const config = () => ({
  forexUrl:
    process.env.FX_API_URL ??
    'https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP',
  ugxUrl: process.env.FX_UGX_API_URL ?? 'https://open.er-api.com/v6/latest/USD',
  ttlSeconds: Number(process.env.FX_CACHE_SECONDS ?? 3600),
  staleSeconds: Number(process.env.FX_STALE_SECONDS ?? 6 * 3600),
  floor: Number(process.env.FX_UGX_FLOOR ?? process.env.FX_UGX_PER_USD ?? DEFAULT_FX_UGX_PER_USD),
});

/** The rates we fall back to. EUR/GBP are withheld unless we have a live quote. */
export function safetySnapshot({ floor = config().floor, reason = 'no live rate' } = {}) {
  return {
    base: BASE_CURRENCY,
    rates: { USD: 1, UGX: Math.max(SAFETY_UGX_PER_USD, floor) },
    source: 'safety',
    live: false,
    fetchedAt: new Date().toISOString(),
    expiresAt: null,
    provider: 'safety',
    reason,
    floor,
    currencies: DISPLAY_CURRENCIES.filter((currency) => ['USD', 'UGX'].includes(currency.code)).map(
      (currency) => currency.code,
    ),
  };
}

async function getJson(url, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read the two provider payloads. Tolerant on purpose: Frankfurter v1 returns
 * `{rates:{…}}` and v2 a similar shape under the requested base, and the shilling
 * endpoint can be swapped for any `{rates:{UGX:…}}` document.
 */
export function readProviderPayloads(forex, ugx) {
  const rates = {};
  const errors = [];

  const forexRates = forex?.rates ?? forex?.data ?? null;
  for (const code of ['EUR', 'GBP']) {
    const value = Number(forexRates?.[code]);
    if (Number.isFinite(value) && value > 0) rates[code] = value;
    else errors.push(`${code} missing from the forex provider`);
  }

  const ugxRate = Number(ugx?.rates?.UGX ?? ugx?.conversion_rates?.UGX);
  if (Number.isFinite(ugxRate) && ugxRate > 0) rates.UGX = ugxRate;
  else errors.push('UGX missing from the shilling provider');

  return { rates, errors };
}

let cache = null;
let inflight = null;

/**
 * The current snapshot. Cached in-process for `FX_CACHE_SECONDS`, which keeps a
 * busy shop to a handful of provider calls an hour.
 */
export async function getRates({ fetchImpl = fetch, force = false, now = Date.now() } = {}) {
  const settings = config();

  if (!force && cache && cache.expiresAt && cache.expiresAt > now) {
    return { ...cache.snapshot, cached: true };
  }
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const [forex, ugx] = await Promise.allSettled([
        getJson(settings.forexUrl, fetchImpl),
        getJson(settings.ugxUrl, fetchImpl),
      ]);

      const { rates, errors } = readProviderPayloads(
        forex.status === 'fulfilled' ? forex.value : null,
        ugx.status === 'fulfilled' ? ugx.value : null,
      );
      const bothDown = forex.status === 'rejected' && ugx.status === 'rejected';
      if (forex.status === 'rejected') errors.push(`forex: ${forex.reason?.message ?? 'failed'}`);
      if (ugx.status === 'rejected') errors.push(`ugx: ${ugx.reason?.message ?? 'failed'}`);

      // Both feeds down but we quoted successfully a short while ago: keep that
      // quote (EUR/GBP included) instead of degrading to a shilling-only table.
      if (bothDown) {
        if (cache?.snapshot && now - new Date(cache.snapshot.fetchedAt).getTime() < settings.staleSeconds * 1000) {
          return { ...cache.snapshot, source: 'stale', cached: true, reason: errors.join('; ') };
        }
        // Nothing answered and nothing worth keeping: quote the safety floor and
        // say so, rather than dressing a fallback up as a partial quote.
        return safetySnapshot({ floor: settings.floor, reason: errors.join('; ') });
      }

      // The shilling is floored, never capped: a weaker shilling (a higher
      // number) is passed through so a UGX invoice keeps matching its USD total.
      if (Number.isFinite(rates.UGX)) {
        rates.UGX = Math.max(rates.UGX, settings.floor);
      } else {
        rates.UGX = Math.max(SAFETY_UGX_PER_USD, settings.floor);
      }
      rates.USD = 1;

      const live = Number.isFinite(rates.EUR) && Number.isFinite(rates.GBP);
      const snapshot = {
        base: BASE_CURRENCY,
        rates,
        source: live && Number.isFinite(rates.UGX) && !errors.some((e) => e.startsWith('ugx')) ? 'live' : 'partial',
        live,
        fetchedAt: new Date(now).toISOString(),
        expiresAt: now + settings.ttlSeconds * 1000,
        provider: 'frankfurter + er-api',
        errors: errors.length > 0 ? errors : undefined,
        floor: settings.floor,
        currencies: DISPLAY_CURRENCIES.filter((currency) => Number.isFinite(rates[currency.code])).map(
          (currency) => currency.code,
        ),
      };

      cache = { snapshot, expiresAt: snapshot.expiresAt };
      return snapshot;
    } catch (error) {
      // Something unexpected — prefer a recent good quote over a bad safety one.
      if (cache?.snapshot && now - new Date(cache.snapshot.fetchedAt).getTime() < settings.staleSeconds * 1000) {
        return { ...cache.snapshot, source: 'stale', cached: true, reason: error.message };
      }
      return safetySnapshot({ floor: settings.floor, reason: error.message });
    }
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

/** The configured rate — what an order falls back to if no live quote lands. */
export const floorRate = () => Number(config().floor) || DEFAULT_FX_UGX_PER_USD;

/**
 * The UGX rate alone, for the quote engine and the shop.
 *
 * A checkout must never wait on a forex provider: after `timeoutMs` we take
 * whatever we already have (a warm cache, or the configured floor) and carry on.
 * The response says which it was, so nothing is silently quoted at a stale rate.
 */
export async function currentUgxRate({ fetchImpl = fetch, timeoutMs = 900 } = {}) {
  const fallback = floorRate();
  if (cache?.snapshot && Number.isFinite(cache.snapshot.rates?.UGX)) {
    return Number(cache.snapshot.rates.UGX);
  }
  try {
    const snapshot = await Promise.race([
      getRates({ fetchImpl }),
      new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs).unref?.()),
    ]);
    return Number(snapshot?.rates?.UGX) || fallback;
  } catch {
    return fallback;
  }
}

export const ratesConfig = config;

/** Test seam: forget the cached snapshot. */
export function resetRatesCache() {
  cache = null;
  inflight = null;
}
