export type DeliveryType = 'uganda' | 'international';

export interface MoneyPair {
  usd: number;
  ugx: number;
}

export interface QuoteTotals {
  factoryCost: MoneyPair;
  managementFee: MoneyPair;
  total: MoneyPair;
  deposit: MoneyPair;
  balance: MoneyPair;
  perUnit: MoneyPair;
}

export interface Quote {
  quantity: number;
  factoryCost: number;
  managementFee: number;
  managementFeeRate: number;
  total: number;
  deposit: number;
  balance: number;
  depositRate: number;
  perUnit: number;
  fxRate: number;
  totals: QuoteTotals;
  lines: {
    pressingCost: number;
    sleeveCost: number;
    setupCost: number;
    /** Plant rate-card adjustment (negative for GZ at volume, positive for premium houses). */
    plantAdjustment: number;
    plantFactor: number;
    unitPrice: number;
    sleevePerUnit: number;
  };
  vinylType: VinylType;
  sleeve: SleeveOption;
  plant: Plant;
  /** True when the requested plant could not take the run and we moved it. */
  plantAdjusted?: boolean;
  requestedPlant?: string | null;
}

export interface VinylType {
  id: string;
  code: string;
  name: string;
  shortName: string;
  tagline: string;
  description: string;
  setupFee: number;
  /** Setup override for short runs — a lathe cut carries no separate plate cost. */
  setup?: Record<number, number>;
  unit: Record<number, number>;
  turnaround: string;
  badge: string | null;
}

export interface QuantityTier {
  quantity: number;
  name: string;
  note: string;
}

export interface SleeveOption {
  id: string;
  code: string;
  name: string;
  shortName: string;
  description: string;
  perUnit: number;
}

export interface PaymentMethod {
  id: 'mtn_momo' | 'airtel_money' | 'card_bank';
  name: string;
  tagline: string;
  description: string;
  currency: string;
  accountName: string;
  accountNumber: string;
  fields: string[];
}

export interface Plant {
  id: string;
  name: string;
  country: string;
  region: string;
  kind: 'pressing' | 'lathe';
  /** Minimum order quantity the plant will quote. */
  moq: number;
  /** Upper bound for boutiques and lathe houses; null means no cap. */
  maxQuantity: number | null;
  /** Their rate card relative to our base price (1 = base). */
  priceFactor: number;
  leadTime: string;
  note: string;
  ordersEmail?: string | null;
}

export interface CompanyConfig {
  company: {
    name: string;
    tagline: string;
    email: string;
    phone: string;
    whatsapp: string;
    /** Digits only (e.g. `256768261003`), for building wa.me links. */
    whatsappNumber?: string;
    location: string;
    hours: string;
  };
  fxRate: number;
  managementFeeRate: number;
  depositRate: number;
  quantities: number[];
  quantityTiers?: QuantityTier[];
  vinylTypes: VinylType[];
  sleeves: SleeveOption[];
  paymentMethods: PaymentMethod[];
  plants: Plant[];
  limits?: {
    maxUploadMb: number;
    maxFiles: number;
    audio: string[];
    artwork: string[];
  };
}

export interface UploadedFile {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  kind: 'audio' | 'artwork';
  url: string;
  createdAt: string;
  demo?: boolean;
}

export interface DraftConfiguration {
  quantity: number;
  vinylTypeId: string;
  sleeveId: string;
  plantId?: string;
}

export interface ClientDetails {
  name: string;
  email: string;
  phone: string;
  deliveryType: DeliveryType;
  deliveryAddress: string;
  deliveryCity: string;
  country: string;
  notes: string;
}

export interface DraftPayment {
  method: string;
  payerPhone: string;
  payerName: string;
}

export interface DraftFiles {
  audio: UploadedFile[];
  artwork: UploadedFile[];
  audioLink: string;
  artworkLink: string;
}

export interface Order {
  id: string;
  createdAt: string;
  status: string;
  demo?: boolean;
  client: ClientDetails;
  configuration: DraftConfiguration;
  quote: Quote & { lines?: Quote['lines'] };
  payment: {
    method: string;
    payerPhone?: string;
    payerName?: string;
    status: string;
    reference?: string | null;
    paidAt?: string;
    depositPaidUsd?: number;
  };
  files: DraftFiles;
  plantPreference?: string;
  plantHandoff?: {
    plant: string;
    at: string;
    mode: string;
    status: string;
    by: string;
    error: string | null;
  };
  plantPayload?: PlantPayload;
  plantPayloadText?: string;
  statusHistory?: { status: string; at: string; by: string; note: string }[];
  termsAcceptedAt?: string;
}

export interface PlantPayload {
  source: string;
  orderId: string;
  receivedAt: string;
  plantPreference: string;
  artistOrLabel: string;
  contact: { email: string; whatsapp: string };
  delivery: { type: string; address: string; city: string; country: string };
  production: {
    quantity: number;
    format: string;
    packaging: string;
    turnaround: string | null;
    plant?: string | null;
    plantMinimumRun?: number | null;
  };
  masterAndArtwork: { role: string; filename: string; bytes: number; download: string }[];
  commercial: {
    factoryCostUsd: number;
    managementFeeUsd: number;
    totalUsd: number;
    totalUgx: number;
    depositRequiredUsd: number;
    paymentMethod: string;
    paymentStatus: string;
  };
  notes: string;
  replyTo: string;
}

export interface WebhookEvent {
  id: string;
  orderId: string;
  channel: 'slack' | 'email' | 'whatsapp' | 'plant' | string;
  mode?: 'live' | 'simulated';
  target: string;
  status: string;
  attempts: number;
  httpStatus: number | null;
  createdAt: string;
  deliveredAt?: string;
  lastAttemptAt?: string;
  error?: string | null;
  message: string;
  payload?: unknown;
}

export interface AdminOverview {
  summary: {
    orders: number;
    pipelineValueUsd: number;
    collectedUsd: number;
    awaitingAction: number;
    forwarded: number;
    units: number;
    undeliveredEvents: number;
  };
  events: WebhookEvent[];
  orders: Order[];
  config: {
    fxRate: number;
    managementFeeRate: number;
    depositRate: number;
    company: CompanyConfig['company'];
    paymentMethods: PaymentMethod[];
  };
  plants: Plant[];
  channels: {
    channel: string;
    label: string;
    icon: string;
    delay: number;
    autoDeliver: boolean;
    live?: boolean;
    mode?: 'live' | 'simulated';
    detail?: string;
  }[];
  notifications?: {
    configured: boolean;
    channels: { channel: string; live: boolean; detail: string }[];
  };
  automation?: {
    autoForward: boolean;
    depositRequired: boolean;
    plantEmail: boolean;
    plantWebhook: boolean;
    whatsappTemplate?: { name: string; language: string; category: string; body: string; parameters: number };
    plants: {
      id: string;
      name: string;
      region?: string;
      moq?: number;
      leadTime?: string;
      ordersEmail: string | null;
      /** The plant inbox is really the desk forwarder while no rep is assigned. */
      aliasesDesk?: boolean;
    }[];
  };
}
