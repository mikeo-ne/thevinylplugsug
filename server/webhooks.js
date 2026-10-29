import { db_, newId } from './store.js';
import { COMPANY, PAYMENT_METHODS } from './config.js';
import { describeConfiguration, PRESSING_PLANTS } from '../shared/pricing.js';
import {
  channelMode,
  channelStatus,
  deliverNotification,
  deliverPlantPayload,
  notificationConfig,
} from './notifications.js';

const CHANNELS = {
  slack: { label: 'Slack', icon: 'hash', delay: 900, autoDeliver: true },
  email: { label: 'Email', icon: 'mail', delay: 1600, autoDeliver: true },
  whatsapp: { label: 'WhatsApp', icon: 'chat', delay: 2600, autoDeliver: true },
  plant: { label: 'Pressing plant', icon: 'factory', delay: 0, autoDeliver: false },
};

export const getChannelMeta = (channel) => CHANNELS[channel] ?? { label: channel, icon: 'bolt' };

const paymentLabel = (methodId) =>
  PAYMENT_METHODS.find((method) => method.id === methodId)?.name ?? methodId;

export const deliveryLabel = (client) =>
  client.deliveryType === 'international'
    ? `International tour city — ${client.deliveryCity}`
    : `Uganda — ${client.deliveryCity}`;

/** Human-readable payload management forwards to the overseas pressing plant. */
export function buildPlantPayload(order) {
  const config = describeConfiguration(order.configuration);
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
      turnaround: config.turnaround,
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
      target: 'press@7hmusicgroup.com · operations@7hmusicgroup.com',
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

export async function forwardOrderToPlant(order, plantId, actor = 'management') {
  const plant = PRESSING_PLANTS.find((item) => item.id === plantId) ?? PRESSING_PLANTS[0];
  order.plantPreference = plant.id;
  order.status = 'forwarded';
  order.forwardedAt = new Date().toISOString();
  order.plantPayload = buildPlantPayload(order);

  const result = await deliverPlantPayload(order, plant.id);
  const db = db_.data;
  const pending = db.events.find(
    (event) => event.orderId === order.id && event.channel === 'plant' && event.status !== 'delivered',
  );

  const deliveredLabel =
    result.status === 'delivered'
      ? `Order ${order.id} pushed to the ${plant.name} endpoint with master + artwork links.`
      : `Order ${order.id} released to ${plant.name} — payload ready for hand-off.`;

  if (pending) {
    pending.status = result.status;
    pending.mode = result.mode ?? pending.mode;
    pending.httpStatus = result.httpStatus ?? null;
    pending.attempts = (pending.attempts ?? 0) + 1;
    pending.error = result.error ?? null;
    pending.deliveredAt = result.status === 'delivered' ? new Date().toISOString() : null;
    pending.target = `${plant.name} · production intake`;
    pending.message = deliveredLabel;
    pending.payload = { plant: plant.id, orderId: order.id };
  } else {
    const event = makeEvent({
      orderId: order.id,
      channel: 'plant',
      target: `${plant.name} · production intake`,
      message: deliveredLabel,
      payload: { plant: plant.id, orderId: order.id },
    });
    pushEvent(event);
    applyDelivery(event.id, result);
  }

  pushEvent(
    makeEvent({
      orderId: order.id,
      channel: 'email',
      target: order.client.email,
      message: `Client notified: ${order.id} is now in production with ${plant.name}.`,
      status: 'delivered',
    }),
  );

  order.statusHistory = [
    ...(order.statusHistory ?? []),
    { status: 'forwarded', at: new Date().toISOString(), by: actor, note: `Released to ${plant.name}` },
  ];

  db_.save();
  return { order, plant };
}

export async function retryEvent(eventId) {
  const db = db_.data;
  const event = db.events.find((item) => item.id === eventId);
  if (!event) return null;

  const order = db.orders.find((item) => item.id === event.orderId);
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
    ...(entry.channel === 'plant' ? { autoDeliver: false } : {}),
  }));
}

export const notificationsConfigured = () => channelStatus().some((entry) => entry.live);

export const getNotificationConfig = notificationConfig;
