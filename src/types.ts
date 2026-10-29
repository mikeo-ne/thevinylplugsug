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

/* ------------------------------------------------------------------ *
 * Shop — records sold to fans
 * ------------------------------------------------------------------ */

export interface ShopRelease {
  id: string;
  title: string;
  /** Catalogue code printed on the sleeve, e.g. 7H-041. */
  release: string;
  formatId: string;
  /** Human-readable press spec, e.g. 12" LP · 33⅓ rpm. */
  format: string;
  weight: string;
  colour: string;
  /** Jacket id from the pressing catalogue, so the shop can render the real mockup. */
  sleeveId: string;
  sleeve: string;
  priceUsd: number;
  stock: number;
  soldOut: boolean;
  lowStock: boolean;
  maxPerOrder: number;
  image: string;
  note: string;
}

export interface ShopDeliveryOption {
  id: string;
  name: string;
  detail: string;
  eta: string;
  priceUsd: number;
  zone: 'uganda' | 'international';
  requiresAddress: boolean;
}

export interface ShopConfig {
  releases: ShopRelease[];
  delivery: ShopDeliveryOption[];
  paymentMethods: PaymentMethod[];
  fxRate: number;
  limits: { maxPerRelease: number };
  company: CompanyConfig['company'];
}

export interface ShopOrderItem {
  releaseId: string;
  title: string;
  release: string;
  image: string;
  priceUsd: number;
  quantity: number;
  lineTotal: number;
}

export interface ShopOrder {
  id: string;
  createdAt: string;
  status: 'placed' | 'packed' | 'shipped' | 'delivered' | 'cancelled';
  buyer: { name: string; email: string; phone: string };
  items: ShopOrderItem[];
  records: number;
  subtotal: number;
  shipping: number;
  total: number;
  totals: {
    subtotal: MoneyPair;
    shipping: MoneyPair;
    total: MoneyPair;
  };
  delivery: ShopDeliveryOption & {
    address: string | null;
    city: string;
    country: string;
  };
  payment: {
    method: PaymentMethod['id'];
    methodName: string;
    status: 'pending' | 'paid';
    reference: string | null;
    accountName: string | null;
    accountNumber: string | null;
  };
  statusHistory: { status: string; at: string; by: string; note: string }[];
  notes: string;
}

/** A shop order as the admin console holds it (adds internals the fan never sees). */
export interface AdminShopOrder extends Omit<ShopOrder, 'payment' | 'notes'> {
  payment: ShopOrder['payment'] & { payerPhone?: string; paidAt?: string };
  buyer: ShopOrder['buyer'] & { notes?: string };
  channel?: string;
  restockedAt?: string;
}

export interface AdminShop {
  summary: {
    orders: number;
    open: number;
    awaitingPayment: number;
    paidOrders: number;
    revenueUsd: number;
    recordsSold: number;
    unitsLeft: number;
  };
  orders: AdminShopOrder[];
  stock: {
    releaseId: string;
    title: string;
    release: string;
    priceUsd: number;
    image: string;
    stock: number;
    sold: number;
    lowStock: boolean;
  }[];
}

/* ---------------------------- system health ---------------------------- */

export interface DatabaseHealth {
  ok: boolean;
  driver: 'postgres' | 'redis' | 'file' | string;
  label: string;
  /** False means the data lives on the function's disk and dies with it. */
  persistent: boolean;
  latencyMs?: number;
  detail?: string;
  error?: string;
  ready?: boolean;
  counts?: Record<string, number>;
}

export interface AlertChannelEnv {
  channel: string;
  ready: boolean;
  variables: { key: string; set: boolean; secret: boolean }[];
  missing: string[];
}

export interface AlertFailure {
  id: string;
  channel: string;
  orderId: string | null;
  attempts: number;
  error: string;
  lastAttemptAt: string;
  message?: string;
}

export interface SystemHealth {
  database: DatabaseHealth;
  alerts: {
    channels: { channel: string; label: string; icon?: string; live: boolean; mode: string; detail: string }[];
    env: AlertChannelEnv[];
    outbox: {
      counts: Record<string, number>;
      failures: AlertFailure[];
      retryable: number;
    };
    automaticRetry: boolean;
  };
  runtime: { node: string; region: string | null; publicBaseUrl: string | null };
}

export interface AlertTestResult {
  channel: string;
  status: 'delivered' | 'failed' | 'unconfigured' | 'simulated';
  mode: string;
  httpStatus?: number;
  target?: string;
  detail?: string;
  error?: string;
  missing?: string[];
  latencyMs?: number;
  attemptedAt: string;
}
