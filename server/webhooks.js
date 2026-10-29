import { db_, newId } from './store.js';
import { COMPANY, PAYMENT_METHODS } from './config.js';
import { describeConfiguration, PRESSING_PLANTS } from '../shared/pricing.js';
import {
  attachPlantPayloadFormatter,
  channelMode,
  channelStatus,
  deliverNotification,
  deliverPlantPayload,
  deliverShopNotification,
  emailPlantOrder,
  emailShopReceipt,
  notificationConfig,
  whatsappTemplateSample,
} from './notifications.js';
import { describeShopOrder } from '../shared/shop.js';

const CHANNELS = {
  slack: { label: 'Slack', icon: 'hash', delay: 900, autoDeliver: true },
  email: { label: 'Email', icon: 'mail', delay: 1600, autoDeliver: true },
  whatsapp: { label: 'WhatsApp', icon: 'chat', delay: 2600, autoDeliver: true },
  plant: { label: 'Pressing plant', icon: 'factory', delay: 0, autoDeliver: false },
};

export const getChannelMeta = (channel) => CHANNELS[channel] ?? { label: channel, icon: 'bolt' };

// notifications.js needs the plant text without importing this module back.
attachPlantPayloadFormatter((order) => plantPayloadText(order));

const paymentLabel = (methodId) =>
  PAYMENT_METHODS.find((method) => method.id === methodId)?.name ?? methodId;

export const deliveryLabel = (client) =>
  client.deliveryType === 'international'
    ? `International tour city — ${client.deliveryCity}`
    : `Uganda — ${client.deliveryCity}`;

/** Human-readable payload management forwards to the overseas pressing plant. */
/**
 * Has the 50% deposit actually landed and been confirmed in the console?
 * `payment.status` is set by an admin, and the recorded amount must cover the
 * deposit on the order's own quote.
 */
export function depositConfirmed(order) {
  const status = order?.payment?.status;
  if (status !== 'deposit_paid' && status !== 'paid') return false;
  const required = Number(order?.quote?.deposit ?? 0);
  const paid = Number(order?.payment?.depositPaidUsd ?? 0);
  if (!Number.isFinite(required) || required <= 0) return true;
  if (!Number.isFinite(paid)) return false;
  return paid + 0.005 >= required;
}

export function buildPlantPayload(order) {
  const config = describeConfiguration(order.configuration);
  const plant =
    PRESSING_PLANTS.find((item) => item.id === (order.configuration?.plantId ?? order.plantPreference)) ?? null;
  const files = [...(order.files?.audio ?? []), ...(order.files?.artwork ?? [])].map((file) => ({
    role: file.kind,
    filename: file.originalName,
    bytes: file.size,
    download: `/api/files/${file.id}/download`,
  }));

  return {
    source: '7H Music Group — Vinyl Brokerage',
    orderId: order.id,
    receivedAt: order.createdAt,
    plantPreference: order.plantPreference ?? 'mobineko',
    artistOrLabel: order.client.name,
    contact: {
      email: order.client.email,
      whatsapp: order.client.phone,
    },
    delivery: {
      type: order.client.deliveryType,
      address: order.client.deliveryAddress,
      city: order.client.deliveryCity,
      country: order.client.country,
    },
    production: {
      quantity: config.quantity,
      format: config.vinyl,
      packaging: config.sleeve,
      turnaround: plant?.leadTime ?? config.turnaround,
      plant: plant ? `${plant.name} — ${plant.region}` : config.plant,
      plantMinimumRun: plant?.moq ?? null,
    },
    masterAndArtwork: files,
    commercial: {
      factoryCostUsd: order.quote.factoryCost,
      managementFeeUsd: order.quote.managementFee,
      totalUsd: order.quote.total,
      totalUgx: order.quote.totals.total.ugx,
      depositRequiredUsd: order.quote.deposit,
      paymentMethod: paymentLabel(order.payment.method),
      paymentStatus: order.payment.status,
    },
    notes: order.client.notes || '—',
    replyTo: COMPANY.email,
  };
}

export function plantPayloadText(order) {
  const payload = buildPlantPayload(order);
  const config = describeConfiguration(order.configuration);
  const files = payload.masterAndArtwork
    .map((file, index) => `   ${index + 1}. ${file.role.toUpperCase()} — ${file.filename}`)
    .join('\n');

  return `7H MUSIC GROUP — PRODUCTION REQUEST
Order:      ${order.id}
Plant:      ${PRESSING_PLANTS.find((p) => p.id === payload.plantPreference)?.name ?? payload.plantPreference}
Artist:     ${order.client.name}
Format:     ${config.quantity} × ${config.vinyl}
Packaging:  ${config.sleeve}
Delivery:   ${deliveryLabel(order.client)} — ${order.client.deliveryAddress}
Contact:    ${order.client.email} / ${order.client.phone}
Total:      $${order.quote.total.toFixed(2)} (UGX ${order.quote.totals.total.ugx.toLocaleString('en-US')})
Deposit:    $${order.quote.deposit.toFixed(2)} · ${paymentLabel(order.payment.method)} · ${order.payment.status}
Files:
${files || '   (pending upload)'}
Notes:      ${order.client.notes || '—'}`;
}

/**
 * Whether the plant hand-off runs on its own once a deposit is confirmed.
 *
 * The deposit is a hard gate: nothing reaches a plant before an admin has marked
 * the 50% deposit as paid, and PLANT_AUTO_FORWARD=false only changes *who* pushes
 * the button, never whether the deposit was paid first.
 */
export const automationConfig = () => ({
  autoForward: process.env.PLANT_AUTO_FORWARD !== 'false',
  /** Deposits always gate the plant hand-off — surfaced in the console. */
  depositRequired: true,
  plantEmail: notificationConfig().plantEmail,
  plantWebhook: Boolean(process.env.PLANT_WEBHOOK_URL),
  whatsappTemplate: whatsappTemplateSample(),
});

function pushEvent(event) {
  const db = db_.data;
  db.events.unshift(event);
  if (db.events.length > 300) db.events.length = 300;
  db_.save();
  return event;
}

function makeEvent({ orderId, channel, target, message, status = 'pending', payload = null }) {
  const mode = channelMode(channel);
  return {
    id: newId('evt'),
    orderId,
    channel,
    mode,
    target,
    message,
    status: mode === 'live' && status === 'pending' ? 'sending' : status,
    attempts: status === 'delivered' ? 1 : 0,
    httpStatus: status === 'delivered' ? 200 : null,
    createdAt: new Date().toISOString(),
    payload,
  };
}

/** Merge a real delivery result onto a stored event. */
function applyDelivery(eventId, result) {
  const db = db_.data;
  const event = db.events.find((item) => item.id === eventId);
  if (!event) return null;

  event.status = result.status;
  event.mode = result.mode ?? event.mode;
  event.httpStatus = result.httpStatus ?? event.httpStatus ?? null;
  event.attempts = (event.attempts ?? 0) + 1;
  event.error = result.error ?? null;
  event.lastAttemptAt = new Date().toISOString();
  if (result.status === 'delivered') event.deliveredAt = result.deliveredAt ?? new Date().toISOString();
  db_.save();
  return event;
}

function scheduleDelivery(eventId) {
  const db = db_.data;
  const event = db.events.find((item) => item.id === eventId);
  if (!event) return;
  const meta = getChannelMeta(event.channel);
  const delay = meta.delay ?? 1200;

  const timer = setTimeout(() => {
    const fresh = db_.data.events.find((item) => item.id === eventId);
    if (!fresh || fresh.status !== 'pending') return;
    fresh.status = 'delivered';
    fresh.httpStatus = 200;
    fresh.attempts = (fresh.attempts ?? 0) + 1;
    fresh.deliveredAt = new Date().toISOString();
    db_.save();
  }, delay);
  timer.unref?.();
}

/**
 * Fire the alert fan-out when a client submits an order.
 *
 * Configured channels make a real network call; unconfigured ones fall back to
 * simulation (timers + read-time reconciliation) and are labelled as such.
 */
export async function emitOrderEvents(order) {
  const config = describeConfiguration(order.configuration);
  const summary = `${order.id} — ${config.quantity} × ${config.vinyl} / ${config.sleeve} for ${order.client.name}`;
  const plantName = PRESSING_PLANTS.find((p) => p.id === order.plantPreference)?.name ?? 'Mobineko';

  const events = [
    makeEvent({
      orderId: order.id,
      channel: 'slack',
      target: '#7h-orders (Slack)',
      message: `New vinyl order ${summary}`,
      payload: { orderId: order.id, totalUsd: order.quote.total, client: order.client.name },
    }),
    makeEvent({
      orderId: order.id,
      channel: 'email',
      target: `${COMPANY.email} · operations desk`,
      message: `Order sheet emailed for ${summary}`,
    }),
    makeEvent({
      orderId: order.id,
      channel: 'whatsapp',
      target: `${COMPANY.phone} (Management)`,
      message: `WhatsApp alert queued — ${order.id} needs deposit verification before plant hand-off.`,
    }),
    makeEvent({
      orderId: order.id,
      channel: 'plant',
      target: `${plantName} · production intake`,
      message: `Awaiting management release — forward master + artwork links to ${plantName}.`,
      status: 'awaiting_forward',
    }),
  ];

  const fanOutStart = Date.now();
  events.forEach((event, index) => {
    // Stagger timestamps so the client-facing feed reads in fan-out order.
    event.createdAt = new Date(fanOutStart + index * 60).toISOString();
    event.payload = event.payload ?? { orderId: order.id };
    pushEvent(event);
  });

  const deliveries = events
    .filter((event) => getChannelMeta(event.channel).autoDeliver)
    .map(async (event) => {
      if (event.mode === 'live') {
        const result = await deliverNotification(event.channel, order);
        return applyDelivery(event.id, result);
      }
      scheduleDelivery(event.id);
      return event;
    });

  await Promise.allSettled(deliveries);
  return events;
}

/**
 * Fan purchase → the desk hears about it immediately, and the buyer gets a receipt.
 *
 * Same contract as emitOrderEvents(): configured channels really deliver, the
 * rest are simulated and reconciled from timestamps, so nothing pretends to have
 * been sent. The buyer's receipt is recorded as its own event so the console can
 * show whether it actually left.
 */
export async function emitShopOrderEvents(order) {
  const summary = describeShopOrder(order);

  const events = [
    makeEvent({
      orderId: order.id,
      channel: 'slack',
      target: '#7h-shop (Slack)',
      message: `New shop order ${summary}`,
      payload: { orderId: order.id, totalUsd: order.total, buyer: order.buyer.name, retail: true },
    }),
    makeEvent({
      orderId: order.id,
      channel: 'email',
      target: `${COMPANY.email} · operations desk`,
      message: `Shop order sheet emailed for ${summary}`,
    }),
    makeEvent({
      orderId: order.id,
      channel: 'whatsapp',
      target: `${COMPANY.phone} (Management)`,
      message: `WhatsApp alert queued — ${order.id} needs payment confirmed before packing.`,
    }),
    makeEvent({
      orderId: order.id,
      channel: 'email',
      target: order.buyer.email,
      message: `Receipt queued for the buyer (${order.buyer.email}).`,
      payload: { orderId: order.id, receipt: true },
    }),
  ];

  const fanOutStart = Date.now();
  events.forEach((event, index) => {
    event.createdAt = new Date(fanOutStart + index * 60).toISOString();
    event.payload = event.payload ?? { orderId: order.id };
    pushEvent(event);
  });

  const deliveries = events
    .filter((event) => getChannelMeta(event.channel).autoDeliver)
    .map(async (event) => {
      if (event.payload?.receipt) {
        const result = await emailShopReceipt(order);
        return applyDelivery(event.id, result);
      }
      if (event.mode === 'live') {
        const result = await deliverShopNotification(event.channel, order);
        return applyDelivery(event.id, result);
      }
      scheduleDelivery(event.id);
      return event;
    });

  await Promise.allSettled(deliveries);
  return events;
}

/** One line on the console when a shop order moves — packed, shipped, cancelled. */
export function pushShopStatusEvent(order, note) {
  const event = makeEvent({
    orderId: order.id,
    channel: 'slack',
    target: 'Shop · operations',
    message: `Shop order ${order.id} — ${note}`,
    status: 'delivered',
    payload: { orderId: order.id, retail: true, status: order.status },
  });
  pushEvent(event);
  return event;
}

/**
 * Promote simulated webhook deliveries that have outlived their channel delay.
 *
 * Timers cover the standalone server, but serverless functions can be frozen the
 * moment a response is sent — so the alert log is reconciled from timestamps at
 * read time. Safe to call on every request.
 */
export function reconcileEvents(now = Date.now()) {
  const db = db_.data;
  let changed = false;

  for (const event of db.events) {
    if (event.status !== 'pending' && event.status !== 'queued') continue;
    // Real deliveries are resolved by their HTTP result, never by a timer.
    if (event.mode === 'live') continue;
    const meta = getChannelMeta(event.channel);
    if (!meta.autoDeliver) continue;

    const base = new Date(event.lastAttemptAt ?? event.createdAt).getTime();
    const delay = meta.delay ?? 1200;
    if (Number.isNaN(base) || now - base < delay) continue;

    event.status = 'delivered';
    event.httpStatus = 200;
    event.attempts = (event.attempts ?? 0) + 1;
    event.deliveredAt = new Date(base + delay).toISOString();
    changed = true;
  }

  if (changed) db_.save();
  return changed;
}

/**
 * Send the order to the pressing plant.
 *
 * Runs automatically when the deposit is confirmed and doubles as the manual
 * "Forward" action — but only once the deposit has actually cleared. Tries the
 * plant's email inbox and its webhook in parallel — whichever is configured —
 * and records one `plant` event with the combined result.
 */
export async function forwardOrderToPlant(order, plantId, actor = 'management', { force = false } = {}) {
  const plant = PRESSING_PLANTS.find((item) => item.id === plantId) ?? PRESSING_PLANTS[0];

  // The commercial gate. No deposit, no production request — even for a manual
  // forward from the console, unless the caller explicitly forces it.
  if (!force && !depositConfirmed(order)) {
    const now = new Date().toISOString();
    order.plantHandoff = {
      plant: plant.id,
      at: now,
      mode: 'blocked',
      status: 'blocked',
      by: actor,
      error: 'Deposit not confirmed',
    };
    const db = db_.data;
    const held = db.events.find(
      (event) => event.orderId === order.id && event.channel === 'plant' && event.status !== 'delivered',
    );
    if (held) {
      held.status = 'blocked';
      held.error = 'Deposit not confirmed';
      held.message = `Held back — the deposit for ${order.id} is not confirmed, so ${plant.name} has not been contacted.`;
      held.lastAttemptAt = now;
    }
    db_.save();
    return { blocked: true, reason: 'deposit_not_confirmed', plant, order };
  }

  order.plantPreference = plant.id;
  order.plantPayload = buildPlantPayload(order);

  const config = automationConfig();
  const attempts = [];

  if (config.plantEmail || process.env.RESEND_API_KEY) {
    attempts.push(await emailPlantOrder(order, plant, plant.id));
  }
  if (process.env.PLANT_WEBHOOK_URL) {
    attempts.push(await deliverPlantPayload(order, plant.id));
  }

  const attempted = attempts.length > 0;
  const delivered = attempts.find((attempt) => attempt.status === 'delivered');
  const failed = attempts.find((attempt) => attempt.status === 'failed');
  const result = delivered ?? failed ?? attempts[0] ?? { status: 'simulated', mode: 'simulated', error: null };

  const now = new Date().toISOString();
  const sent = Boolean(delivered);
  order.status = 'forwarded';
  order.forwardedAt = now;
  order.plantHandoff = {
    plant: plant.id,
    at: now,
    mode: result.mode,
    status: result.status,
    by: actor,
    error: result.error ?? null,
  };

  const label = sent
    ? `Order ${order.id} emailed to ${plant.name}${process.env.PLANT_WEBHOOK_URL ? ' and pushed to their endpoint' : ''}.`
    : attempted
      ? `Hand-off to ${plant.name} failed — ${result.error ?? 'unknown error'}`
      : `Order ${order.id} released to ${plant.name} — payload ready (no plant order address configured).`;

  const db = db_.data;
  const pending = db.events.find(
    (event) => event.orderId === order.id && event.channel === 'plant' && event.status !== 'delivered',
  );

  if (pending) {
    pending.status = result.status;
    pending.mode = result.mode ?? pending.mode;
    pending.httpStatus = result.httpStatus ?? null;
    pending.attempts = (pending.attempts ?? 0) + 1;
    pending.error = result.error ?? null;
    pending.deliveredAt = sent ? now : null;
    pending.lastAttemptAt = now;
    pending.target = plant.ordersEmail
      ? `${plant.name} · ${plant.ordersEmail}`
      : `${plant.name} · production intake`;
    pending.message = label;
    pending.payload = { plant: plant.id, orderId: order.id, automatic: actor === 'system' };
  } else {
    const event = makeEvent({
      orderId: order.id,
      channel: 'plant',
      target: plant.ordersEmail ? `${plant.name} · ${plant.ordersEmail}` : `${plant.name} · production intake`,
      message: label,
      payload: { plant: plant.id, orderId: order.id, automatic: actor === 'system' },
    });
    pushEvent(event);
    applyDelivery(event.id, result);
  }

  if (sent) {
    pushEvent(
      makeEvent({
        orderId: order.id,
        channel: 'email',
        target: order.client.email,
        message: `Client notified: ${order.id} is now in production with ${plant.name}.`,
        status: 'delivered',
      }),
    );
  }

  order.statusHistory = [
    ...(order.statusHistory ?? []),
    {
      status: 'forwarded',
      at: now,
      by: actor,
      note: sent
        ? `Released to ${plant.name} automatically`
        : `Released to ${plant.name} — hand-off pending`,
    },
  ];

  db_.save();
  return { order, plant, delivery: result };
}

/**
 * Automatic release, called by the API. Safe to call more than once: an order
 * already sitting at the plant is not sent twice.
 */
export async function autoForwardOrder(order, { trigger = 'deposit' } = {}) {
  const config = automationConfig();
  if (!config.autoForward) return { skipped: true, reason: 'PLANT_AUTO_FORWARD=false' };
  if (!depositConfirmed(order)) return { skipped: true, reason: 'Deposit not confirmed' };
  if (order.plantHandoff && order.plantHandoff.status === 'delivered') {
    return { skipped: true, reason: 'already released' };
  }
  const result = await forwardOrderToPlant(order, order.plantPreference ?? 'mobineko', 'system');
  const db = db_.data;
  db.events.unshift(
    makeEvent({
      orderId: order.id,
      channel: 'slack',
      target: 'Automation',
      message: `Auto-release triggered by ${trigger} — ${order.id} → ${result.plant.name}.`,
      status: 'delivered',
      payload: { trigger, automatic: true },
    }),
  );
  db_.save();
  return result;
}

export async function retryEvent(eventId) {
  const db = db_.data;
  const event = db.events.find((item) => item.id === eventId);
  if (!event) return null;

  const order = db.orders.find((item) => item.id === event.orderId);
  if (event.channel === 'plant' && order) {
    const result = await forwardOrderToPlant(order, order.plantPreference ?? 'mobineko', 'management');
    return db_.data.events.find((item) => item.id === eventId) ?? result.order;
  }
  if (event.mode === 'live' && order) {
    event.status = 'sending';
    event.attempts = (event.attempts ?? 0) + 1;
    event.lastAttemptAt = new Date().toISOString();
    db_.save();
    const result = await deliverNotification(event.channel, order);
    return applyDelivery(eventId, result);
  }

  event.status = 'pending';
  event.httpStatus = null;
  event.attempts = (event.attempts ?? 0) + 1;
  event.lastAttemptAt = new Date().toISOString();
  db_.save();
  const timer = setTimeout(() => {
    const fresh = db_.data.events.find((item) => item.id === eventId);
    if (!fresh || fresh.status !== 'pending') return;
    fresh.status = 'delivered';
    fresh.httpStatus = 200;
    fresh.deliveredAt = new Date().toISOString();
    db_.save();
  }, 1400);
  timer.unref?.();
  return event;
}

export async function emitTestEvent() {
  const db = db_.data;
  const latest = db.orders[0];
  const event = makeEvent({
    orderId: latest?.id ?? '7H-TEST-PING',
    channel: 'slack',
    target: '#7h-orders (Slack)',
    message: 'Manual test alert from the 7H operations console.',
    status: 'pending',
  });
  pushEvent(event);

  if (event.mode === 'live' && latest) {
    const result = await deliverNotification('slack', latest);
    return applyDelivery(event.id, result);
  }

  scheduleDelivery(event.id);
  return event;
}

/** Per-channel configuration state for the console. */
export function notificationChannels() {
  const configured = channelStatus();
  return configured.map((entry) => ({
    channel: entry.channel,
    ...getChannelMeta(entry.channel),
    live: entry.live,
    mode: entry.live ? 'live' : 'simulated',
    detail: entry.detail,
    ...(entry.channel === 'plant' ? { autoDeliver: automationConfig().autoForward } : {}),
  }));
}

export const notificationsConfigured = () => channelStatus().some((entry) => entry.live);

export const getNotificationConfig = notificationConfig;
