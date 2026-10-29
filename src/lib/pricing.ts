// Thin typed wrapper around the shared quoting engine so the client and the
// Express API always agree on the maths.
import {
  calculateQuote as sharedCalculateQuote,
  VINYL_TYPES,
  SLEEVE_OPTIONS,
  QUANTITIES,
  PRESSING_PLANTS,
  MANAGEMENT_FEE_RATE,
  DEPOSIT_RATE,
  DEFAULT_FX_UGX_PER_USD,
} from '../../shared/pricing.js';
import type { DraftConfiguration, Plant, Quote, SleeveOption, VinylType } from '../types';

export const vinylTypes = VINYL_TYPES as VinylType[];
export const sleeves = SLEEVE_OPTIONS as SleeveOption[];
export const quantities = QUANTITIES as number[];
export const plants = PRESSING_PLANTS as Plant[];
export const managementFeeRate = MANAGEMENT_FEE_RATE as number;
export const depositRate = DEPOSIT_RATE as number;
export const fallbackFxRate = DEFAULT_FX_UGX_PER_USD as number;

export function quoteFor(config: DraftConfiguration, fxRate = fallbackFxRate): Quote {
  const result = sharedCalculateQuote({
    quantity: config.quantity,
    vinylTypeId: config.vinylTypeId,
    sleeveId: config.sleeveId,
    fxRate,
  }) as unknown as Quote & { valid: boolean };
  return result;
}

export const DEFAULT_CONFIGURATION: DraftConfiguration = {
  quantity: 250,
  vinylTypeId: 'lp_colored',
  sleeveId: 'gatefold',
};

export const vinylById = (id: string) => vinylTypes.find((type) => type.id === id) ?? vinylTypes[0];
export const sleeveById = (id: string) => sleeves.find((option) => option.id === id) ?? sleeves[0];
