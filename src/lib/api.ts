import type { AdminOverview, CompanyConfig, Order, UploadedFile, WebhookEvent } from '../types';

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

  upload: async (files: { audio: File[]; artwork: File[] }) => {
    const form = new FormData();
    files.audio.forEach((file) => form.append('audio', file));
    files.artwork.forEach((file) => form.append('artwork', file));
    return request<{ uploads: UploadedFile[] }>('/api/uploads', { method: 'POST', body: form });
  },

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
};
