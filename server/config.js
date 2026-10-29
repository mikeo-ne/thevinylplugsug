import { DEFAULT_FX_UGX_PER_USD, MANAGEMENT_FEE_RATE, DEPOSIT_RATE } from '../shared/pricing.js';

export const PORT = Number(process.env.PORT ?? 4173);
export const FX_UGX_PER_USD = Number(process.env.FX_UGX_PER_USD ?? DEFAULT_FX_UGX_PER_USD);
export const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE ?? '7HADMIN';
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export const COMPANY = {
  name: '7H Music Group',
  tagline: 'Vinyl Production & Brokerage',
  email: 'press@7hmusicgroup.com',
  phone: '+256 700 411 700',
  whatsapp: 'https://wa.me/256700411700',
  location: 'Kampala, Uganda',
  hours: 'Mon–Sat · 09:00–19:00 EAT',
};

export const PAYMENT_METHODS = [
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
];

export const ADMIN_CONFIG = {
  fxRate: FX_UGX_PER_USD,
  managementFeeRate: MANAGEMENT_FEE_RATE,
  depositRate: DEPOSIT_RATE,
  company: COMPANY,
  paymentMethods: PAYMENT_METHODS,
};
