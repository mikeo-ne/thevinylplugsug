import { whatsappUrl } from './contact';
import { usd } from './format';
import type { Order } from '../types';

/**
 * The hand-off layer: how an order leaves the app and lands in a conversation.
 *
 * Everything here works with no credentials. `wa.me` opens WhatsApp with the
 * message already written, which is the whole reason the brief's workflow can run
 * before Meta approves a business account.
 */

/** The invoice lives on the API so it can be printed, shared or forwarded. */
export const invoiceUrl = (orderId: string) => `/api/orders/${encodeURIComponent(orderId)}/invoice`;

export const invoiceNumber = (order: Pick<Order, 'invoice'>) => order.invoice?.number ?? null;

const spec = (order: Order) => {
  const format = order.quote?.vinylType?.name ?? String(order.configuration?.vinylTypeId ?? 'Vinyl');
  const sleeve = order.quote?.sleeve?.name ?? String(order.configuration?.sleeveId ?? '');
  const quantity = order.configuration?.quantity;
  return [format, quantity ? `${quantity} units` : null, sleeve || null].filter(Boolean).join(' · ');
};

/**
 * What the client sends the desk after placing an order.
 *
 * Short enough to read on a phone, complete enough that the desk does not have to
 * ask a follow-up question: who, what, how much, and which document to file it
 * against.
 */
export function orderWhatsAppMessage(order: Order): string {
  const lines = [
    'Hello 7H Music Group — I have placed an order.',
    '',
    `Order: ${order.id}`,
  ];
  if (order.invoice?.number) lines.push(`Invoice: ${order.invoice.number}`);
  lines.push(`Artist / label: ${order.client?.name ?? '—'}`);
  lines.push(`Spec: ${spec(order)}`);
  if (order.quote?.total) lines.push(`All-in total: ${usd(order.quote.total, { cents: true })}`);
  if (order.quote?.deposit) lines.push(`Deposit due: ${usd(order.quote.deposit, { cents: true })}`);
  lines.push('');
  lines.push(`Invoice: ${absoluteUrl(invoiceUrl(order.id))}`);
  return lines.join('\n');
}

/** What the client sends once they have paid (or are about to). */
export function depositWhatsAppMessage(order: Order, options: { paid?: boolean } = {}): string {
  const lines = [
    options.paid
      ? `Hello 7H Music Group — deposit sent for order ${order.id}.`
      : `Hello 7H Music Group — paying the deposit on order ${order.id}.`,
    '',
  ];
  if (order.invoice?.number) lines.push(`Invoice: ${order.invoice.number}`);
  if (order.payment?.reference) lines.push(`Payment reference: ${order.payment.reference}`);
  if (order.quote?.deposit) lines.push(`Deposit: ${usd(order.quote.deposit, { cents: true })}`);
  lines.push(options.paid ? 'Proof of payment attached.' : 'I will send proof of payment here.');
  lines.push('');
  lines.push(`Order: ${absoluteUrl(`/success/${encodeURIComponent(order.id)}`)}`);
  return lines.join('\n');
}

export const orderWhatsAppLink = (order: Order) => whatsappUrl(orderWhatsAppMessage(order));

export const depositWhatsAppLink = (order: Order, options?: { paid?: boolean }) =>
  whatsappUrl(depositWhatsAppMessage(order, options));

/**
 * The USSD fallback for people whose phone never shows the prompt — a feature
 * phone, a full SIM menu, or a wallet the collection rail cannot reach.
 *
 * `#` must be percent-encoded or the dialler truncates the string at that point,
 * which is why the old copy told people to type the code by hand instead.
 */
export const ussdDialUrl = (code: string) => `tel:${code.replace(/#/g, '%23')}`;

export const USSD_CODES: Record<string, string> = {
  mtn_momo: '*165*3#',
  airtel_money: '*185*9#',
};

export const ussdCodeFor = (method: string) => USSD_CODES[method] ?? USSD_CODES.mtn_momo;

/** Absolute links inside a WhatsApp message — a relative path is useless in a chat. */
function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (typeof window === 'undefined') return path;
  return `${window.location.origin}${path}`;
}
