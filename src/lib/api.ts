import type {
  AdminOverview,
  DepositIntent,
  AdminShop,
  AdminShopOrder,
  AlertTestResult,
  RatesSnapshot,
  CompanyConfig,
  Order,
  PlantMargin,
  PlantSheet,
  ShopConfig,
  ShopOrder,
  SystemHealth,
  TelegramChats,
  TelegramWebhook,
  UploadedFile,
  WebhookEvent,
} from '../types';

const TOKEN_KEY = '7h-admin-token';

export class ApiError extends Error {
  status: number;
  fields?: Record<string, string>;

  constructor(message: string, status: number, fields?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && init.body) headers.set('Content-Type', 'application/json');

  const token = getAdminToken();
  if (token && path.startsWith('/api/admin')) headers.set('X-Admin-Token', token);

  const response = await fetch(path, { ...init, headers });
  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    if (response.status === 401 && path.startsWith('/api/admin')) clearAdminToken();
    const message =
      (payload && typeof payload === 'object' && 'error' in payload && String(payload.error)) ||
      'Request failed. Please try again.';
    const fields =
      payload && typeof payload === 'object' && 'errors' in payload
        ? (payload.errors as Record<string, string>)
        : undefined;
    throw new ApiError(message, response.status, fields);
  }

  return payload as T;
}

export const getAdminToken = () => {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setAdminToken = (token: string) => {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage unavailable */
  }
};

export const clearAdminToken = () => {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
};

export const api = {
  config: () => request<CompanyConfig>('/api/config'),

  /** Small files only — anything over a couple of MB goes through uploadOne(). */
  upload: async (files: { audio: File[]; artwork: File[] }) => {
    const form = new FormData();
    files.audio.forEach((file) => form.append('audio', file));
    files.artwork.forEach((file) => form.append('artwork', file));
    return request<{ uploads: UploadedFile[] }>('/api/uploads', { method: 'POST', body: form });
  },

  /* ----------------------------- deposits ----------------------------- */

  requestDeposit: (orderId: string, body: { provider?: string; payerPhone?: string }) =>
    request<{ intent: DepositIntent; due?: { amountUgx: number; amountUsd: number; feeUgx: number }; message?: string }>(
      `/api/orders/${encodeURIComponent(orderId)}/deposit/request`,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  depositStatus: (orderId: string, intentId: string) =>
    request<{
      intent: DepositIntent;
      payment: { status: string; confirmedBy: string | null };
      next: string;
    }>(`/api/orders/${encodeURIComponent(orderId)}/deposit/${encodeURIComponent(intentId)}`),

  adminRequestDeposit: (orderId: string, body: { provider?: string; payerPhone?: string }) =>
    request<{ intent: DepositIntent; order: Order }>(
      `/api/admin/orders/${encodeURIComponent(orderId)}/deposit/request`,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  adminRefreshDeposit: (orderId: string, intentId: string) =>
    request<{ intent: DepositIntent; order: Order }>(
      `/api/admin/orders/${encodeURIComponent(orderId)}/deposit/${encodeURIComponent(intentId)}/refresh`,
      { method: 'POST' },
    ),

  adminConfirmWalletDeposit: (orderId: string) =>
    request<{ order: Order; intent: DepositIntent; release?: unknown }>(
      `/api/admin/orders/${encodeURIComponent(orderId)}/deposit/confirm`,
      { method: 'POST' },
    ),

  adminSweepDeposits: () =>
    request<{ checked: number; settled: number; failed: number; pending: number }>(
      '/api/admin/deposits/sweep',
      { method: 'POST' },
    ),

  /* ------------------------------ files ------------------------------ */

  adminFiles: () =>
    request<{
      storage: { driver: string; label: string; durable: boolean; files: number; bytes: number };
      limits: { maxUploadMb: number; chunkBytes: number };
      files: UploadedFile[];
      groups: { folder: string; files: UploadedFile[]; bytes: number }[];
      counts: { files: number; complete: number; uploading: number; bytes: number };
    }>('/api/admin/uploads'),

  adminDeleteFile: (id: string) =>
    request<{ ok: boolean; removed: string }>(`/api/admin/uploads/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  createOrder: (body: unknown) =>
    request<{ order: Order; quote: Order['quote'] }>('/api/orders', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getOrder: (id: string) =>
    request<{ order: Order; events: WebhookEvent[] }>(`/api/orders/${encodeURIComponent(id)}`),

  adminLogin: (passcode: string) =>
    request<{ token: string; operator: string }>('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ passcode }),
    }),

  adminOverview: () => request<AdminOverview>('/api/admin/overview'),

  plantSheet: (id: string, plant: string) =>
    request<{ sheet: PlantSheet; margin: PlantMargin }>(
      `/api/admin/orders/${encodeURIComponent(id)}/plant-sheet?plant=${encodeURIComponent(plant)}`,
    ),

  recordPlantQuote: (
    id: string,
    body: {
      plantId: string;
      costUsd: number;
      freightUsd?: number;
      dutiesUsd?: number;
      note?: string;
      acknowledgeLoss?: boolean;
    },
  ) =>
    request<{ order: Order; margin: PlantMargin }>(`/api/admin/orders/${encodeURIComponent(id)}/plant-quote`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  adminUpdateOrder: (id: string, body: { status?: string; paymentStatus?: string }) =>
    request<{ order: Order }>(`/api/admin/orders/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  adminForward: (id: string, plantId: string) =>
    request<{ order: Order }>(`/api/admin/orders/${id}/forward`, {
      method: 'POST',
      body: JSON.stringify({ plantId }),
    }),

  adminMarkDeposit: (id: string, amount?: number) =>
    request<{ order: Order }>(`/api/admin/orders/${id}/payment`, {
      method: 'POST',
      body: JSON.stringify({ amount }),
    }),

  adminRetryEvent: (id: string) =>
    request<{ event: WebhookEvent }>(`/api/admin/events/${id}/retry`, { method: 'POST' }),

  adminTestEvent: () => request<{ event: WebhookEvent }>('/api/admin/events/test', { method: 'POST' }),

  adminReset: () => request<{ ok: boolean }>('/api/admin/reset-demo', { method: 'POST' }),

  /* ------------------------------- shop ------------------------------- */

  shop: () => request<ShopConfig>('/api/shop'),

  createShopOrder: (body: unknown) =>
    request<{ order: ShopOrder; summary: string; stock: { id: string; stock: number; soldOut: boolean }[] }>(
      '/api/shop/orders',
      { method: 'POST', body: JSON.stringify(body) },
    ),

  getShopOrder: (id: string) =>
    request<{ order: ShopOrder }>(`/api/shop/orders/${encodeURIComponent(id)}`),

  adminShop: () => request<AdminShop>('/api/admin/shop'),

  /** Live FX. Cheap: the server caches it for an hour. */
  rates: () => request<RatesSnapshot>('/api/rates'),

  adminSystem: () => request<SystemHealth>('/api/admin/system'),

  /** Ask the bot who has messaged it — that is where the chat id comes from. */
  adminTelegramChats: () => request<TelegramChats>('/api/admin/telegram/chats'),

  /** Let the bot answer messages, so it can hand back a chat id in chat. */
  adminTelegramWebhook: () => request<TelegramWebhook>('/api/admin/telegram/webhook'),

  adminEnableTelegramReplies: () =>
    request<{ ok: boolean; url: string } & { info: TelegramWebhook }>('/api/admin/telegram/webhook', {
      method: 'POST',
    }),

  adminDisableTelegramReplies: () =>
    request<{ ok: boolean } & { info: TelegramWebhook }>('/api/admin/telegram/webhook', {
      method: 'DELETE',
    }),

  adminTestAlerts: (channels?: string[]) =>
    request<{ results: AlertTestResult[] }>('/api/admin/alerts/test', {
      method: 'POST',
      body: JSON.stringify({ channels }),
    }),

  adminRetryAlerts: () =>
    request<{ summary: { attempted: number; delivered: number; failed: number }; outbox: SystemHealth['alerts']['outbox'] }>(
      '/api/admin/alerts/retry',
      { method: 'POST' },
    ),

  adminUpdateShopOrder: (id: string, body: { status?: string; paymentStatus?: string; note?: string }) =>
    request<{ order: AdminShopOrder }>(`/api/admin/shop/orders/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  adminSetStock: (releaseId: string, stock: number) =>
    request<{ releaseId: string; stock: number }>(
      `/api/admin/shop/stock/${encodeURIComponent(releaseId)}`,
      { method: 'PATCH', body: JSON.stringify({ stock }) },
    ),
};
