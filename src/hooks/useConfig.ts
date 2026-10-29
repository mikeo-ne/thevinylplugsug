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

// Sensible local defaults so the configurator paints instantly; the API config
// takes over as soon as it lands (live FX rate + payment rails).
const fallback: CompanyConfig = {
  company: {
    name: '7H Music Group',
    tagline: 'Vinyl Production & Brokerage',
    email: 'press@7hmusicgroup.com',
    phone: '+256 700 411 700',
    whatsapp: 'https://wa.me/256700411700',
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
      accountNumber: '0772 411 700',
      fields: ['payerPhone'],
    },
    {
      id: 'airtel_money',
      name: 'Airtel Money',
      tagline: 'Instant UGX deposit · 0.5% fee',
      description: 'Airtel wallet payments are confirmed by SMS within seconds.',
      currency: 'UGX',
      accountName: '7H MUSIC GROUP LTD',
      accountNumber: '0701 411 700',
      fields: ['payerPhone'],
    },
    {
      id: 'card_bank',
      name: 'International Card / Bank Transfer',
      tagline: 'USD · Visa, Mastercard, SWIFT',
      description: 'Pay by card or SWIFT transfer. Bank details are issued on the invoice.',
      currency: 'USD',
      accountName: '7H MUSIC GROUP LTD',
      accountNumber: 'Stanbic Bank · 9030012345678',
      fields: [],
    },
  ],
};

let cache: CompanyConfig | null = null;
let inflight: Promise<CompanyConfig> | null = null;

export function useConfig() {
  const [config, setConfig] = useState<CompanyConfig | null>(cache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (cache) return () => { active = false; };

    inflight ??= api.config();
    inflight
      .then((result) => {
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
