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
    unitPrice: number;
    sleevePerUnit: number;
  };
  vinylType: VinylType;
  sleeve: SleeveOption;
}

export interface VinylType {
  id: string;
  code: string;
  name: string;
  shortName: string;
  tagline: string;
  description: string;
  setupFee: number;
  unit: Record<number, number>;
  turnaround: string;
  badge: string | null;
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
  region: string;
}

export interface CompanyConfig {
  company: {
    name: string;
    tagline: string;
    email: string;
    phone: string;
    whatsapp: string;
    location: string;
    hours: string;
  };
  fxRate: number;
  managementFeeRate: number;
  depositRate: number;
  quantities: number[];
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
  production: { quantity: number; format: string; packaging: string; turnaround: string | null };
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
}
