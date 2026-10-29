import { db_, newId } from './store.js';
import { COMPANY, PAYMENT_METHODS } from './config.js';
import { describeConfiguration, PRESSING_PLANTS } from '../shared/pricing.js';

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
  return {
    id: newId('evt'),
    orderId,
    channel,
    target,
    message,
    status,
    attempts: status === 'delivered' ? 1 : 0,
    httpStatus: status === 'delivered' ? 200 : null,
    createdAt: new Date().toISOString(),
    payload,
  };
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

/** Fire the simulated webhook fan-out when a client submits an order. */
export function emitOrderEvents(order) {
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
    if (event.status === 'pending' && getChannelMeta(event.channel).autoDeliver) {
      scheduleDelivery(event.id);
    }
  });

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

export function forwardOrderToPlant(order, plantId, actor = 'management') {
  const plant = PRESSING_PLANTS.find((item) => item.id === plantId) ?? PRESSING_PLANTS[0];
  order.plantPreference = plant.id;
  order.status = 'forwarded';
  order.forwardedAt = new Date().toISOString();
  order.plantPayload = buildPlantPayload(order);

  const db = db_.data;
  const pending = db.events.find(
    (event) => event.orderId === order.id && event.channel === 'plant' && event.status !== 'delivered',
  );
  if (pending) {
    pending.status = 'delivered';
    pending.httpStatus = 200;
    pending.attempts = (pending.attempts ?? 0) + 1;
    pending.deliveredAt = new Date().toISOString();
    pending.target = `${plant.name} · production intake`;
    pending.message = `Order ${order.id} forwarded to ${plant.name} with master + artwork links.`;
    pending.payload = { plant: plant.id, orderId: order.id };
  } else {
    pushEvent(
      makeEvent({
        orderId: order.id,
        channel: 'plant',
        target: `${plant.name} · production intake`,
        message: `Order ${order.id} re-forwarded to ${plant.name}.`,
        status: 'delivered',
      }),
    );
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

export function retryEvent(eventId) {
  const db = db_.data;
  const event = db.events.find((item) => item.id === eventId);
  if (!event) return null;
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

export function emitTestEvent() {
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
  scheduleDelivery(event.id);
  return event;
}
