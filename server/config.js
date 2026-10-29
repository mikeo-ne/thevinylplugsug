import { DEFAULT_FX_UGX_PER_USD, MANAGEMENT_FEE_RATE, DEPOSIT_RATE } from '../shared/pricing.js';

export const PORT = Number(process.env.PORT ?? 4173);
export const FX_UGX_PER_USD = Number(process.env.FX_UGX_PER_USD ?? DEFAULT_FX_UGX_PER_USD);
export const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE ?? '7HADMIN';
export const SESSION_SECRET =
  process.env.SESSION_SECRET ?? `7h-vinyl-session::${ADMIN_PASSCODE}::v1`;
export const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 hours
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
export const IS_SERVERLESS = Boolean(process.env.VERCEL);

// Vercel caps serverless request bodies at 4.5MB, so the API advertises a lower
// direct-upload limit there and clients fall back to WeTransfer/Drive links.
export const MAX_UPLOAD_MB = Math.max(
  1,
  Number(process.env.MAX_UPLOAD_MB ?? (process.env.VERCEL ? 4 : 80)),
);

// Business contact details. Overridable per environment so a staging deploy can
// point somewhere else, but the defaults are the real 7H desk.
const CONTACT_PHONE = process.env.CONTACT_PHONE ?? '+256 768 261 003';
const CONTACT_WHATSAPP_NUMBER = process.env.CONTACT_WHATSAPP ?? '256768261003';

export const COMPANY = {
  name: '7H Music Group',
  tagline: 'Vinyl Production & Brokerage',
  email: process.env.CONTACT_EMAIL ?? '7hmusicgroupug@gmail.com',
  phone: CONTACT_PHONE,
  whatsapp: `https://wa.me/${CONTACT_WHATSAPP_NUMBER}`,
  whatsappNumber: CONTACT_WHATSAPP_NUMBER,
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
    accountName: '7H MUSIC GROUP',
    accountNumber: process.env.MOMO_NUMBER ?? '0768 261 003',
    fields: ['payerPhone'],
  },
  {
    id: 'airtel_money',
    name: 'Airtel Money',
    tagline: 'Instant UGX deposit · 0.5% fee',
    description: 'Airtel wallet payments are confirmed by SMS within seconds.',
    currency: 'UGX',
    accountName: '7H MUSIC GROUP',
    accountNumber: process.env.AIRTEL_NUMBER ?? 'Issued on your invoice',
    fields: ['payerPhone'],
  },
  {
    id: 'card_bank',
    name: 'International Card / Bank Transfer',
    tagline: 'USD · Visa, Mastercard, SWIFT',
    description: 'Pay by card or SWIFT transfer. Bank details are issued on the invoice.',
    currency: 'USD',
    accountName: '7H MUSIC GROUP',
    accountNumber: process.env.BANK_ACCOUNT ?? 'Issued on the invoice',
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
