import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { CompanyConfig } from '../types';
import {
  depositRate,
  fallbackFxRate,
  managementFeeRate,
  plants,
  quantities,
  sleeves,
  vinylTypes,
} from '../lib/pricing';
import { CONTACT, whatsappUrl } from '../lib/contact';

// Sensible local defaults so the configurator paints instantly; the API config
// takes over as soon as it lands (live FX rate + payment rails).
const fallback: CompanyConfig = {
  company: {
    name: '7H Music Group',
    tagline: 'Vinyl Production & Brokerage',
    email: CONTACT.email,
    phone: CONTACT.phone,
    whatsapp: whatsappUrl(),
    whatsappNumber: CONTACT.whatsappNumber,
    location: 'Kampala, Uganda',
    hours: 'Mon–Sat · 09:00–19:00 EAT',
  },
  fxRate: fallbackFxRate,
  managementFeeRate,
  depositRate,
  quantities,
  vinylTypes,
  sleeves,
  plants,
  limits: {
    maxUploadMb: 80,
    maxFiles: 6,
    audio: ['.wav', '.aif', '.aiff', '.flac', '.mp3', '.m4a', '.aac'],
    artwork: ['.pdf', '.jpg', '.jpeg', '.png', '.tif', '.tiff'],
  },
  paymentMethods: [
    {
      id: 'mtn_momo',
      name: 'MTN Mobile Money',
      tagline: 'Instant UGX deposit · 0.5% fee',
      description: 'Approve the prompt on your phone. Funds clear in under a minute.',
      currency: 'UGX',
      accountName: '7H MUSIC GROUP LTD',
      accountNumber: '0768 261 003',
      fields: ['payerPhone'],
    },
    {
      id: 'airtel_money',
      name: 'Airtel Money',
      tagline: 'Instant UGX deposit · 0.5% fee',
      description: 'Airtel wallet payments are confirmed by SMS within seconds.',
      currency: 'UGX',
      accountName: '7H MUSIC GROUP LTD',
      accountNumber: 'Issued on your invoice',
      fields: ['payerPhone'],
    },
    {
      id: 'card_bank',
      name: 'International Card / Bank Transfer',
      tagline: 'USD · Visa, Mastercard, SWIFT',
      description: 'Pay by card or SWIFT transfer. Bank details are issued on the invoice.',
      currency: 'USD',
      accountName: '7H MUSIC GROUP LTD',
      accountNumber: 'Issued on the invoice',
      fields: [],
    },
  ],
};

let cache: CompanyConfig | null = null;
let inflight: Promise<CompanyConfig> | null = null;

/**
 * Never trust the response shape: if a deploy misroutes `/api/config` to the
 * SPA shell (HTML instead of JSON) we fall back to local pricing rather than
 * crashing the configurator.
 */
function isCompanyConfig(value: unknown): value is CompanyConfig {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CompanyConfig>;
  return (
    Array.isArray(candidate.vinylTypes) &&
    candidate.vinylTypes.length > 0 &&
    Array.isArray(candidate.sleeves) &&
    candidate.sleeves.length > 0 &&
    Array.isArray(candidate.paymentMethods) &&
    candidate.paymentMethods.length > 0 &&
    Array.isArray(candidate.quantities) &&
    Array.isArray(candidate.plants) &&
    typeof candidate.fxRate === 'number' &&
    Boolean(candidate.company)
  );
}

export function useConfig() {
  const [config, setConfig] = useState<CompanyConfig | null>(cache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (cache) return () => { active = false; };

    inflight ??= api.config();
    inflight
      .then((result) => {
        if (!isCompanyConfig(result)) {
          throw new Error('Malformed /api/config response');
        }
        cache = result;
        if (active) setConfig(result);
      })
      .catch(() => {
        if (active) setError('Live configuration unavailable — showing indicative pricing.');
      })
      .finally(() => {
        inflight = null;
      });

    return () => {
      active = false;
    };
  }, []);

  return { config: config ?? fallback, loading: !config, error };
}
