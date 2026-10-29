export const usd = (value: number, opts: { cents?: boolean } = {}) => {
  const cents = opts.cents ?? Math.abs(value % 1) > 0.001;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(Number.isFinite(value) ? value : 0);
};

export const ugx = (value: number) => {
  const rounded = Math.round(value);
  return `UGX ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(
    Number.isFinite(rounded) ? rounded : 0,
  )}`;
};

export const compactNumber = (value: number) =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

export const bytes = (value: number) => {
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const size = value / 1024 ** exponent;
  return `${size.toFixed(size >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
};

export const dateTime = (iso?: string) => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const relativeTime = (iso?: string) => {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diff = Date.now() - then;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return dateTime(iso);
};

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

export const statusLabel = (status: string) =>
  ({
    received: 'Received',
    confirmed: 'Confirmed',
    forwarded: 'Sent to plant',
    in_production: 'In production',
    shipped: 'Shipped',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
    awaiting_deposit: 'Awaiting deposit',
    processing: 'Processing',
    deposit_paid: 'Deposit paid',
    paid: 'Paid in full',
    pending: 'Pending',
    queued: 'Queued',
    sending: 'Sending',
    failed: 'Failed',
    simulated: 'Simulated',
    awaiting_forward: 'Awaiting release',
    placed: 'Placed',
    packed: 'Packed',
  })[status] ?? status;

export const statusTone = (status: string) => {
  switch (status) {
    case 'delivered':
    case 'paid':
    case 'deposit_paid':
      return 'lime';
    case 'received':
    case 'confirmed':
    case 'processing':
    case 'pending':
    case 'queued':
    case 'sending':
    case 'placed':
      return 'amber';
    case 'failed':
      return 'red';
    case 'simulated':
      return 'muted';
    case 'forwarded':
    case 'in_production':
    case 'packed':
    case 'shipped':
      return 'sky';
    case 'cancelled':
      return 'red';
    default:
      return 'muted';
  }
};
