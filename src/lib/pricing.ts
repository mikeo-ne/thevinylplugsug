// Thin typed wrapper around the shared quoting engine so the client and the
// Express API always agree on the maths.
import {
  calculateQuote as sharedCalculateQuote,
  VINYL_TYPES,
  SLEEVE_OPTIONS,
  QUANTITIES,
  QUANTITY_TIERS,
  PRESSING_PLANTS,
  DEFAULT_PLANT_ID,
  MANAGEMENT_FEE_RATE,
  DEPOSIT_RATE,
  DEFAULT_FX_UGX_PER_USD,
  plantSupportsQuantity,
  plantsForQuantity,
  setupFeeFor,
} from '../../shared/pricing.js';
import type {
  DraftConfiguration,
  Plant,
  QuantityTier,
  Quote,
  SleeveOption,
  VinylType,
} from '../types';

export const vinylTypes = VINYL_TYPES as VinylType[];
export const sleeves = SLEEVE_OPTIONS as SleeveOption[];
export const quantities = QUANTITIES as number[];
export const plants = PRESSING_PLANTS as Plant[];
export const quantityTiers = QUANTITY_TIERS as QuantityTier[];
export const defaultPlantId = DEFAULT_PLANT_ID as string;
export { plantSupportsQuantity, plantsForQuantity, setupFeeFor };
export const managementFeeRate = MANAGEMENT_FEE_RATE as number;
export const depositRate = DEPOSIT_RATE as number;
export const fallbackFxRate = DEFAULT_FX_UGX_PER_USD as number;

export function quoteFor(
  config: DraftConfiguration,
  fxRate = fallbackFxRate,
  plantId = config.plantId ?? defaultPlantId,
): Quote {
  const result = sharedCalculateQuote({
    quantity: config.quantity,
    vinylTypeId: config.vinylTypeId,
    sleeveId: config.sleeveId,
    plantId,
    fxRate,
  }) as unknown as Quote & { valid: boolean };
  return result;
}

export const DEFAULT_CONFIGURATION: DraftConfiguration = {
  quantity: 250,
  vinylTypeId: 'lp_colored',
  sleeveId: 'gatefold',
  plantId: defaultPlantId,
};

export const plantById = (id: string) => plants.find((plant) => plant.id === id) ?? null;
export const vinylById = (id: string) => vinylTypes.find((type) => type.id === id) ?? vinylTypes[0];
export const sleeveById = (id: string) => sleeves.find((option) => option.id === id) ?? sleeves[0];
