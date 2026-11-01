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
  /** The plant's own inbox (fallback target when our dispatch address is the desk). */
  repEmail?: string | null;
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
  /** USD is the base; `display` lists what the switcher may offer. */
  currency?: {
    base: string;
    display: { code: CurrencyCode; name: string; short: string; locale: string; minorUnits: number }[];
    safetyUgxRate: number;
  };
  managementFeeRate: number;
  depositRate: number;
  quantities: number[];
  quantityTiers?: QuantityTier[];
  vinylTypes: VinylType[];
  sleeves: SleeveOption[];
  paymentMethods: PaymentMethod[];
  plants: Plant[];
  paymentRails?: { provider: string; ready: boolean; environment?: string }[];
  limits?: {
    maxUploadMb: number;
    maxFiles: number;
    chunkBytes?: number;
    audio: string[];
    artwork: string[];
  };
}

export interface UploadedFile {
  id: string;
  originalName: string;
  storedName?: string;
  mimeType: string;
  size: number;
  kind: 'audio' | 'artwork';
  url: string | null;
  createdAt: string;
  demo?: boolean;
  /** Where the bytes live: `postgres` survives a redeploy, `file` does not. */
  storage?: 'postgres' | 'file' | 'legacy-disk' | string;
  storageLabel?: string;
  /** Filed by order: `orders/7H-2026-8K2Q/audio`, or a dated inbox folder. */
  folder?: string;
  orderId?: string | null;
  status?: 'uploading' | 'complete';
  sha256?: string;
  chunks?: number;
  chunkBytes?: number;
  bytes?: number;
  completedAt?: string;
  downloadUrl?: string;
  linkedOrder?: string | null;
}

/** One wallet collection attempt against an order's deposit. */
export interface DepositIntent {
  id: string;
  provider: 'mtn_momo' | 'airtel_money' | string;
  status: 'pending' | 'successful' | 'failed' | string;
  amountUgx: number;
  amountUsd?: number;
  paidUgx?: number | null;
  feeUgx?: number | null;
  reference?: string;
  payerMasked?: string;
  requestedAt: string;
  checkedAt?: string | null;
  settledAt?: string | null;
  error?: string | null;
  message?: string | null;
  confirmedDeposit?: boolean;
}

/** What a payment rail can and cannot do right now. */
export interface PaymentRail {
  provider: string;
  label?: string;
  ready: boolean;
  environment?: string;
  missing: string[];
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
  /** Who signs for the parcel — often not the artist or label contact. */
  recipientName: string;
  deliveryAddress: string;
  deliveryCity: string;
  /** State, province, county or Uganda's region — part of a courier label. */
  deliveryRegion: string;
  deliveryPostalCode: string;
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
  /**
   * Titles, sides and durations, one per line.
   *
   * Not decoration: GZ Media's studio checks the side splits against the timings,
   * and Dr. Dub cuts in the order the files arrive. Without it the plant order
   * sheet cannot be completed, which is exactly what the sheet tells you.
   */
  tracklist: string;
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
    confirmedAt?: string;
    confirmedBy?: string;
    confirmationNote?: string;
    /** Every wallet collection attempt, newest first. */
    intents?: DepositIntent[];
    /** What the wallet actually collected, regardless of who confirmed it. */
    collected?: {
      provider: string;
      intentId: string;
      currency: string;
      amount: number;
      amountUsd: number;
      at: string;
    };
    awaitingConfirmation?: { reason: string; amountUgx: number; dueUgx: number; at: string };
  };
  files: DraftFiles;
  /** The numbered document this order was issued (see server/invoices.js). */
  invoice?: InvoiceSummary | null;
  plantPreference?: string;
  /** Titles, sides and durations as the client or the desk wrote them. */
  tracklist?: string;
  /** What the plant actually quoted, once the desk records it. */
  plantQuote?: {
    plantId: string;
    costUsd: number;
    freightUsd: number;
    dutiesUsd: number;
    note: string;
    source: string;
    quotedAt: string;
    acknowledgedLoss: boolean;
    acknowledgedAt: string | null;
  } | null;
  plantMargin?: PlantMargin;
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
  delivery: {
    type: string;
    recipient?: string;
    phone?: string;
    address: string;
    city: string;
    region?: string;
    postalCode?: string;
    country: string;
    formatted?: string;
  };
  /** The supplier-facing drop-ship slip, ready to forward or print. */
  dispatch?: DispatchSlip;
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

/**
 * A client-facing invoice. It never carries the brokerage line — the price is
 * all-in — so the margin is a console-only number (`margin` on the admin view).
 */
export interface InvoiceSummary {
  number: string;
  issuedAt: string;
  status: string;
  url: string;
  amounts?: {
    totalUsd: number;
    depositUsd: number;
    paidUsd: number;
    awaitingUsd: number;
    outstandingUsd: number;
    balanceUsd: number;
  };
}

/**
 * One field of a plant's intake form, filled from the order where the portal has
 * the answer and flagged where it does not.
 */
export interface PlantSheetField {
  key: string;
  label: string;
  value: string | null;
  status: 'ready' | 'assumed' | 'missing';
  blocker: boolean;
  note: string | null;
}

export interface PlantSheet {
  plant: {
    id: string;
    name: string;
    channel: string;
    portal: string;
    email: string | null;
    quoteMode: string;
    fileDelivery: string;
    minimum: number;
    minimumNote: string;
    sources: { label: string; url: string; checked: string }[];
  };
  order: {
    reference: string | null;
    catalogNumber: string | null;
    artist: string | null;
    deliveredTo: string | null;
    quantity: number;
    format: string;
    turnaround: string | null;
  };
  fields: PlantSheetField[];
  files: { role: string; name: string; bytes: number | null; sha256: string | null; download: string | null }[];
  warnings: string[];
  missing: string[];
  blockers: string[];
  ready: boolean;
  text: string;
}

/**
 * The money check that happens when the plant's real price meets the client's
 * fixed one. `unverified` means nobody has recorded a plant quote yet — which is
 * not the same as "profitable".
 */
export interface PlantMargin {
  status: 'unverified' | 'safe' | 'loss';
  revenueUsd: number;
  costUsd: number | null;
  freightUsd: number | null;
  dutiesUsd: number | null;
  landedCostUsd: number | null;
  marginUsd: number | null;
  marginPct: number | null;
  lossRisk: boolean;
  acknowledged?: boolean;
  detail: string;
}

/**
 * One movement of money, flattened from an order, a wallet intent or a shop sale.
 * Derived at read time — there is no ledger table to drift out of step.
 */
export interface LedgerRow {
  id: string;
  kind: 'pressing' | 'shop';
  orderId: string;
  at: string;
  client: string;
  contact: string | null;
  method: string;
  methodName: string;
  reference: string | null;
  amountUsd: number;
  amountUgx: number;
  feeUgx: number;
  status: 'collected' | 'collected_unconfirmed' | 'pending' | 'failed' | 'owed';
  confirmed: boolean;
  confirmedBy: string | null;
  note: string | null;
  depositUsd: number;
  orderStatus: string;
}

export interface LedgerTotals {
  collectedUsd: number;
  thisMonthUsd: number;
  awaitingUsd: number;
  pendingUsd: number;
  owedUsd: number;
  counts: Record<string, number>;
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
    /** Orders whose recorded plant cost is above what the client paid. */
    lossRisk?: number;
    /** Orders with no plant quote recorded — the margin is unknown, not fine. */
    marginUnverified?: number;
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
  channels: AlertChannelSummary[];
  notifications?: {
    configured: boolean;
    channels: AlertChannelSummary[];
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
      /** The plant's own inbox, printed as the forward-to address on a slip. */
      repEmail?: string | null;
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

export interface DispatchSlip {
  shipTo: {
    recipient: string;
    phone: string;
    email: string;
    street: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
    instructions: string;
  };
  instructions: string[];
  slip: string;
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
    recipientName?: string | null;
    address: string | null;
    city: string;
    region?: string | null;
    postalCode?: string | null;
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

export interface TelegramWebhook {
  configured: boolean;
  url?: string | null;
  expectedUrl?: string;
  pendingUpdates?: number;
  lastError?: string | null;
  lastErrorAt?: string | null;
  error?: string;
}

export interface TelegramChats {
  status: 'ok' | 'unconfigured' | 'webhook' | 'error';
  bot?: string | null;
  chats: { id: string; type: string; title: string | null; username: string | null }[];
  hint?: string | null;
  error?: string;
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

/**
 * Whether a channel is *proven*, not merely configured.
 *
 * `ready` comes from the environment (the variables are set); `verified` comes
 * from the alert log (a provider accepted a message with the exact credentials
 * this process holds right now). A revoked Slack URL or a rotated Resend key is
 * `ready` but never `verified` — which is the whole point.
 */
export interface AlertChannelVerification {
  channel: string;
  ready: boolean;
  verified: boolean;
  status: 'proven' | 'untested' | 'degraded' | 'unconfigured';
  /** `click_to_chat` means WhatsApp works through wa.me links without a token. */
  mode?: 'api' | 'click_to_chat' | 'not_set_up';
  /** True when the "not configured" state is by design, not a fault. */
  notFault?: boolean;
  fingerprint: string | null;
  proofAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  target: string | null;
  rotated: boolean;
  missing: string[];
  detail: string;
}

/**
 * One row of the alert rail as the console shows it: configured (`ready`) and
 * proven (`verified`) are different claims, and `status` is the four-state badge.
 */
export interface AlertChannelSummary {
  channel: string;
  label: string;
  icon: string;
  delay?: number;
  autoDeliver: boolean;
  live?: boolean;
  mode?: 'live' | 'simulated';
  detail?: string;
  ready?: boolean;
  verified?: boolean;
  status?: 'proven' | 'untested' | 'degraded' | 'unconfigured';
  /** WhatsApp works through wa.me links even with no Cloud API token. */
  clickToChat?: boolean;
  proofAt?: string | null;
  lastError?: string | null;
}

export interface SystemHealth {
  database: DatabaseHealth;
  alerts: {
    channels: { channel: string; label: string; icon?: string; live: boolean; mode: string; detail: string }[];
    env: AlertChannelEnv[];
    verification?: AlertChannelVerification[];
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

/* ------------------------------- currency ------------------------------- */

export type CurrencyCode = 'UGX' | 'USD' | 'EUR' | 'GBP';

/**
 * The live-rate snapshot from `/api/rates`.
 *
 * `source` is deliberately explicit: `live` (a fresh provider quote), `partial`
 * (one provider answered), `stale` (a recent quote kept because the provider is
 * down) or `safety` (the configured floor only). The UI says which.
 */
export interface RatesSnapshot {
  base: string;
  rates: Partial<Record<CurrencyCode, number>>;
  source: 'live' | 'partial' | 'stale' | 'safety' | string;
  live: boolean;
  fetchedAt: string;
  expiresAt: string | null;
  provider?: string;
  reason?: string;
  floor?: number;
  currencies: CurrencyCode[];
  cached?: boolean;
  errors?: string[];
}
