import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { fallbackFxRate } from '../lib/pricing';
import {
  BASE_CURRENCY,
  SAFETY_UGX_PER_USD,
  convertFromUsd,
  currencyForDelivery,
  formatMoney,
  isDisplayCurrency,
} from '../../shared/currency.js';
import type { CurrencyCode, RatesSnapshot } from '../types';

const SNAPSHOT_KEY = '7h-rates';
const CHOICE_KEY = '7h-currency';
const SESSION_TTL_MS = 60 * 60 * 1000;

export interface DestinationLock {
  currency: CurrencyCode;
  label: string;
}

interface RatesContextValue {
  snapshot: RatesSnapshot;
  status: 'loading' | 'ready' | 'error';
  currency: CurrencyCode;
  /** True while the currency is following the delivery destination. */
  locked: boolean;
  lock: DestinationLock | null;
  setCurrency: (code: CurrencyCode | 'auto') => void;
  setDestination: (destination: { zone?: string; country?: string; deliveryId?: string; label?: string }) => void;
  clearDestination: () => void;
  /** Which currencies the switcher may offer right now. */
  available: CurrencyCode[];
  /** 1 USD = `rate` units of the active currency. */
  rate: number;
  /** Convert a USD amount into the active currency. */
  convert: (usd: number) => number;
  /**
   * Format a USD amount in the active currency. Pass the amount the server
   * already computed in shillings to keep receipts exact.
   */
  display: (usd: number, opts?: { ugx?: number; cents?: boolean }) => string;
  /** Format an amount that is already in `code`. */
  money: (amount: number, code?: CurrencyCode) => string;
  /**
   * The converted line under a USD figure — `null` when the page is already in
   * USD, so callers can skip the element instead of printing a duplicate price.
   */
  note: (usd: number, opts?: { ugx?: number; prefix?: string }) => string | null;
  /** `1 USD = UGX 4,360 · live` — the small print under a quote. */
  rateLine: string;
  source: 'live' | 'cached' | 'safety';
}

const RatesContext = createContext<RatesContextValue | null>(null);

const safetySnapshot = (): RatesSnapshot => ({
  base: BASE_CURRENCY,
  rates: { USD: 1, UGX: Math.max(SAFETY_UGX_PER_USD, fallbackFxRate) },
  source: 'safety',
  live: false,
  fetchedAt: new Date().toISOString(),
  expiresAt: null,
  provider: 'safety',
  floor: fallbackFxRate,
  currencies: ['USD', 'UGX'],
});

function readCachedSnapshot(): RatesSnapshot | null {
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { snapshot: RatesSnapshot; storedAt: number };
    if (!parsed?.snapshot?.rates) return null;
    if (Date.now() - parsed.storedAt > SESSION_TTL_MS) return null;
    return parsed.snapshot;
  } catch {
    return null;
  }
}

function readCachedChoice(): { currency: CurrencyCode; auto: boolean } | null {
  try {
    const raw = sessionStorage.getItem(CHOICE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { currency?: string; auto?: boolean };
    if (!isDisplayCurrency(parsed.currency)) return null;
    return { currency: parsed.currency as CurrencyCode, auto: parsed.auto !== false };
  } catch {
    return null;
  }
}

/**
 * Guess a currency before anyone has picked a destination — the browser's own
 * clock is the cheapest signal we have (Africa/Kampala, Europe/London, …).
 */
export function guessCurrency(tz?: string, locale?: string): CurrencyCode {
  const zone = tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  const language = locale ?? navigator.language ?? 'en';
  if (/^Africa\/(Kampala|Nairobi|Dar_es_Salaam|Kigali|Juba)$/i.test(zone) || /-UG\b$/i.test(language)) return 'UGX';
  if (/^Europe\/London$/i.test(zone) || /^en-GB$/i.test(language)) return 'GBP';
  if (/^Europe\//i.test(zone)) return 'EUR';
  return BASE_CURRENCY;
}

export function RatesProvider({ children }: { children: React.ReactNode }) {
  const cached = useRef(readCachedSnapshot());
  const choice = useRef(readCachedChoice());
  const [snapshot, setSnapshot] = useState<RatesSnapshot>(cached.current ?? safetySnapshot());
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(cached.current ? 'ready' : 'loading');
  const [currency, setCurrencyState] = useState<CurrencyCode>(choice.current?.currency ?? guessCurrency());
  const [auto, setAuto] = useState<boolean>(choice.current?.auto ?? true);
  const [lock, setLock] = useState<DestinationLock | null>(null);

  // Live rates on load, cached for the session (sessionStorage + in-memory).
  useEffect(() => {
    if (cached.current) return;
    let active = true;
    api
      .rates()
      .then((result) => {
        if (!active) return;
        const normalised: RatesSnapshot = {
          ...result,
          rates: { ...result.rates, USD: 1 },
          currencies: result.currencies?.length ? result.currencies : ['USD', 'UGX'],
        };
        setSnapshot(normalised);
        setStatus('ready');
        try {
          sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ snapshot: normalised, storedAt: Date.now() }));
        } catch {
          /* private mode — the in-memory copy is enough */
        }
      })
      .catch(() => {
        if (!active) return;
        setSnapshot(safetySnapshot());
        setStatus('error');
      });
    return () => {
      active = false;
    };
  }, []);

  // Remember the visitor's choice for the rest of the session.
  useEffect(() => {
    try {
      sessionStorage.setItem(CHOICE_KEY, JSON.stringify({ currency, auto }));
    } catch {
      /* ignore */
    }
  }, [currency, auto]);

  const available = useMemo<CurrencyCode[]>(() => {
    const fromSnapshot = (snapshot.currencies ?? []).filter(isDisplayCurrency);
    return fromSnapshot.length > 0 ? fromSnapshot : ['USD', 'UGX'];
  }, [snapshot.currencies]);

  // A currency that lost its rate (the provider failed) must not stay selected.
  useEffect(() => {
    if (!available.includes(currency)) setCurrencyState(available[0] ?? BASE_CURRENCY);
  }, [available, currency]);

  const setCurrency = useCallback((code: CurrencyCode | 'auto') => {
    if (code === 'auto') {
      setAuto(true);
      setLock(null);
      setCurrencyState(guessCurrency());
      return;
    }
    setAuto(false);
    setLock(null);
    if (isDisplayCurrency(code)) setCurrencyState(code);
  }, []);

  const setDestination = useCallback(
    ({ zone, country, deliveryId, label }: { zone?: string; country?: string; deliveryId?: string; label?: string }) => {
      const implied = currencyForDelivery({ zone, country, deliveryId }) as CurrencyCode;
      setAuto(true);
      setLock({ currency: implied, label: label ?? 'your delivery address' });
      setCurrencyState(implied);
    },
    [],
  );

  const clearDestination = useCallback(() => {
    setLock(null);
    if (auto) setCurrencyState(guessCurrency());
  }, [auto]);

  const rate = useMemo(() => {
    if (currency === BASE_CURRENCY) return 1;
    const value = Number(snapshot.rates?.[currency]);
    if (Number.isFinite(value) && value > 0) return value;
    return currency === 'UGX' ? Math.max(SAFETY_UGX_PER_USD, fallbackFxRate) : 1;
  }, [currency, snapshot.rates]);

  const convert = useCallback((usd: number) => convertFromUsd(usd, currency, snapshot.rates), [currency, snapshot.rates]);

  const display = useCallback(
    (usd: number, opts: { ugx?: number; cents?: boolean } = {}) => {
      // On UGX, prefer the amount the server computed so a receipt matches the invoice.
      if (currency === 'UGX' && typeof opts.ugx === 'number' && Number.isFinite(opts.ugx)) {
        return formatMoney(opts.ugx, 'UGX', { cents: opts.cents });
      }
      return formatMoney(convertFromUsd(usd, currency, snapshot.rates), currency, { cents: opts.cents });
    },
    [currency, snapshot.rates],
  );

  const money = useCallback(
    (amount: number, code: CurrencyCode = currency) => formatMoney(amount, code),
    [currency],
  );

  const source = snapshot.source === 'safety' ? 'safety' : snapshot.cached ? 'cached' : 'live';

  const note = useCallback(
    (amount: number, opts: { ugx?: number; prefix?: string } = {}) => {
      if (currency === BASE_CURRENCY) return null;
      const prefix = opts.prefix ?? '≈ ';
      return `${prefix}${display(amount, { ugx: opts.ugx })}`;
    },
    [currency, display],
  );

  const rateLine = useMemo(() => {
    if (currency === BASE_CURRENCY) {
      return source === 'safety' ? 'USD base · live rates unavailable' : 'USD base currency';
    }
    const stamp = new Date(snapshot.fetchedAt);
    const when = Number.isNaN(stamp.getTime())
      ? ''
      : ` · ${stamp.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}, ${stamp.toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
        })}`;
    return `1 USD = ${formatMoney(Math.round(rate * 100) / 100, currency)}${when}`;
  }, [currency, rate, source, snapshot.fetchedAt]);

  const value = useMemo<RatesContextValue>(
    () => ({
      snapshot,
      status,
      currency,
      locked: Boolean(lock),
      lock,
      setCurrency,
      setDestination,
      clearDestination,
      available,
      rate,
      convert,
      display,
      money,
      note,
      rateLine,
      source,
    }),
    [
      snapshot,
      status,
      currency,
      lock,
      setCurrency,
      setDestination,
      clearDestination,
      available,
      rate,
      convert,
      display,
      money,
      note,
      rateLine,
      source,
    ],
  );

  return <RatesContext.Provider value={value}>{children}</RatesContext.Provider>;
}

export function useRates() {
  const context = useContext(RatesContext);
  if (!context) throw new Error('useRates must be used inside <RatesProvider>');
  return context;
}
