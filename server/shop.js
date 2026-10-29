/**
 * Retail shop — the storefront side of the business.
 *
 * A fan buying one record and a label buying 250 are different transactions, so
 * they get different pipelines: this module owns the shop's stock, its orders and
 * its validation, and never touches the production order flow in app.js.
 *
 * Money is quoted in USD with a UGX equivalent at the configured rate, and stock
 * is decremented in the same synchronous pass that accepts the order, so two
 * people cannot buy the last copy.
 */
import { COMPANY, FX_UGX_PER_USD, PAYMENT_METHODS } from './config.js';
import { db_, newShopOrderId } from './store.js';
import {
  DELIVERY_OPTIONS,
  MAX_PER_RELEASE,
  SHOP_ORDER_STATUSES,
  SHOP_PAYMENT_METHODS,
  SHOP_RELEASES,
  calculateShopOrder,
  describeShopOrder,
  shopCatalogue,
  shopReleaseById,
} from '../shared/shop.js';
import { emitShopOrderEvents, pushShopStatusEvent } from './webhooks.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const PHONE_RE = /^\+?[0-9][0-9\s()-]{6,19}$/;

const text = (value, max) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const shop = () => {
  const db = db_.data;
  if (!db.shop) db.shop = { stock: {}, orders: [] };
  if (!db.shop.stock) db.shop.stock = {};
  if (!Array.isArray(db.shop.orders)) db.shop.orders = [];
  return db.shop;
};

/** Live count on the shelf. Missing entries fall back to the opening count. */
export const stockOf = (releaseId) => {
  const state = shop();
  const stored = state.stock[releaseId];
  if (Number.isFinite(stored)) return Math.max(0, Math.floor(stored));
  const release = shopReleaseById(releaseId);
  return release ? release.stock : 0;
};

const writeStock = (releaseId, quantity) => {
  const state = shop();
  state.stock[releaseId] = Math.max(0, Math.floor(quantity));
  db_.save();
  return state.stock[releaseId];
};

/** The shop as the storefront sees it: prices, spec, and what is actually left. */
export function shopCatalogueWithStock() {
  return shopCatalogue().map((release) => {
    const stock = stockOf(release.id);
    return {
      ...release,
      stock,
      soldOut: stock <= 0,
      lowStock: stock > 0 && stock <= 5,
      maxPerOrder: Math.min(MAX_PER_RELEASE, stock),
    };
  });
}

/** Everything the shop page needs in one request. */
export function shopConfig(fxRate = FX_UGX_PER_USD) {
  return {
    releases: shopCatalogueWithStock(),
    delivery: DELIVERY_OPTIONS,
    paymentMethods: PAYMENT_METHODS.filter((method) => SHOP_PAYMENT_METHODS.includes(method.id)),
    fxRate,
    limits: { maxPerRelease: MAX_PER_RELEASE },
    company: COMPANY,
  };
}

/**
 * Public view of a shop order — no internal event log, no operator notes, and
 * contact details masked. The reference is the only key, so the page must not
 * hand an enumerator a full email address and phone number.
 */
export function shopOrderView(order) {
  const method = PAYMENT_METHODS.find((entry) => entry.id === order.payment.method);
  const [local, domain] = String(order.buyer.email).split('@');
  return {
    id: order.id,
    createdAt: order.createdAt,
    status: order.status,
    buyer: {
      name: order.buyer.name,
      email: domain ? `${local.slice(0, 2)}${'•'.repeat(Math.max(2, local.length - 2))}@${domain}` : '•••',
      phone: order.buyer.phone.replace(/(\d{3})\d+(\d{2})$/, '$1 ••• $2'),
    },
    items: order.items,
    records: order.records,
    subtotal: order.subtotal,
    shipping: order.shipping,
    total: order.total,
    totals: order.totals,
    delivery: order.delivery,
    payment: {
      method: order.payment.method,
      methodName: method?.name ?? order.payment.method,
      status: order.payment.status,
      reference: order.payment.reference ?? null,
      accountName: method?.accountName ?? null,
      accountNumber: method?.accountNumber ?? null,
    },
    statusHistory: order.statusHistory ?? [],
    notes: order.buyer.notes ?? '',
  };
}

const fail = (status, error, extra = {}) => ({ status, body: { error, ...extra } });

/**
 * Take an order.
 *
 * Validates the buyer, prices the bag with the shared calculator, checks every
 * line against live stock, decrements, stores, then fires the desk alerts and the
 * buyer's receipt. Stock is only touched once the order is known to be valid.
 */
export async function placeShopOrder(body = {}, fxRate = FX_UGX_PER_USD) {
  const buyer = body.buyer ?? {};
  const delivery = body.delivery ?? {};
  const payment = body.payment ?? {};
  const errors = {};

  const name = text(buyer.name, 120);
  const email = text(buyer.email, 160);
  const phone = text(buyer.phone, 30).replace(/\s+/g, ' ');
  const notes = text(buyer.notes, 600);
  const address = text(delivery.address, 300);
  const city = text(delivery.city, 120);
  const region = text(delivery.region, 120);
  const postalCode = text(delivery.postalCode, 32);
  const recipientName = text(delivery.recipientName, 120) || name;
  const country = text(delivery.country, 80);

  if (name.length < 2) errors.name = 'Tell us who the order is for.';
  if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email — the receipt goes there.';
  if (!PHONE_RE.test(phone)) errors.phone = 'Enter a phone number with country code.';

  const quote = calculateShopOrder({
    items: body.items,
    deliveryId: delivery.id,
    fxRate,
  });

  if (!quote.delivery) errors.delivery = 'Choose how you want the record delivered.';
  if (quote.delivery?.requiresAddress && address.length < 6) {
    errors.address = 'Add the full delivery address.';
  }
  if (quote.delivery?.requiresAddress && city.length < 2) errors.city = 'Add the delivery town or city.';
  if (quote.delivery?.requiresAddress && region.length < 2) {
    errors.region = 'Add the region, state or county — couriers need it.';
  }
  if (quote.delivery?.zone === 'international' && country.length < 2) {
    errors.country = 'Add the delivery country.';
  }
  if (!SHOP_PAYMENT_METHODS.includes(payment.method)) {
    errors.paymentMethod = 'Choose how you want to pay.';
  }

  if (Object.keys(errors).length > 0 || !quote.valid) {
    return fail(422, quote.errors[0] ?? 'Please check the highlighted fields.', {
      errors,
      ...(quote.errors.length ? { detail: quote.errors } : {}),
    });
  }

  // Stock is the only thing that can still say no.
  for (const line of quote.lines) {
    const left = stockOf(line.releaseId);
    if (line.quantity > left) {
      const release = shopReleaseById(line.releaseId);
      return fail(
        409,
        left === 0
          ? `${release.title} just sold out — we restock the colour pressings monthly.`
          : `Only ${left} cop${left === 1 ? 'y' : 'ies'} of ${release.title} left — adjust the quantity.`,
        { code: 'out_of_stock', releaseId: line.releaseId, available: left },
      );
    }
  }

  const db = db_.data;
  const state = shop();
  const createdAt = new Date().toISOString();
  const order = {
    id: newShopOrderId(state.orders.map((item) => item.id)),
    createdAt,
    channel: 'shop',
    status: 'placed',
    buyer: { name, email, phone, notes },
    items: quote.lines,
    records: quote.records,
    subtotal: quote.subtotal,
    shipping: quote.shipping,
    total: quote.total,
    totals: quote.totals,
    delivery: {
      id: quote.delivery.id,
      name: quote.delivery.name,
      detail: quote.delivery.detail,
      eta: quote.delivery.eta,
      zone: quote.delivery.zone,
      requiresAddress: quote.delivery.requiresAddress,
      recipientName: quote.delivery.requiresAddress ? recipientName : name,
      address: quote.delivery.requiresAddress ? address : null,
      city: quote.delivery.requiresAddress ? city : 'Kampala',
      region: quote.delivery.requiresAddress ? region : null,
      postalCode: quote.delivery.requiresAddress ? postalCode || null : null,
      country: quote.delivery.requiresAddress ? country || 'Uganda' : 'Uganda',
    },
    payment: {
      method: payment.method,
      payerPhone: text(payment.payerPhone, 30) || phone,
      status: 'pending',
      reference:
        payment.method === 'card_bank'
          ? null
          : `SHOP-${payment.method === 'mtn_momo' ? 'MOMO' : 'AIRTEL'}-${Math.floor(
              Math.random() * 900000 + 100000,
            )}`,
    },
    statusHistory: [
      { status: 'placed', at: createdAt, by: 'fan', note: 'Order placed in the shop' },
    ],
    clientUserAgent: text(body.userAgent, 200) || null,
  };

  // Take the records out of stock *in the database* before the order exists.
  // The loop above explains nicely what is short; this is the part that actually
  // holds the line when two fans tap Buy on the last copy at the same moment.
  const reservation = await db_.reserve(
    quote.lines.map((line) => ({ releaseId: line.releaseId, quantity: line.quantity })),
  );
  if (!reservation.ok) {
    const release = shopReleaseById(reservation.releaseId);
    const left = Math.max(0, Number(reservation.available ?? 0));
    return fail(
      409,
      left === 0
        ? `${release.title} just sold out — someone else got the last copy.`
        : `Only ${left} cop${left === 1 ? 'y' : 'ies'} of ${release.title} left — adjust the quantity.`,
      { code: 'out_of_stock', releaseId: reservation.releaseId, available: left },
    );
  }
  if (!reservation.stock) {
    // The file driver keeps its own copy; nothing outside this process can race.
    for (const line of quote.lines) {
      writeStock(line.releaseId, stockOf(line.releaseId) - line.quantity);
    }
  }

  state.orders.unshift(order);
  db_.save();

  await emitShopOrderEvents(order);

  return {
    status: 201,
    body: {
      order: shopOrderView(order),
      summary: describeShopOrder(order),
      stock: shopCatalogueWithStock().map(({ id, stock, soldOut }) => ({ id, stock, soldOut })),
    },
  };
}

export const findShopOrder = (id) => {
  const wanted = String(id ?? '').toUpperCase();
  return shop().orders.find((order) => order.id.toUpperCase() === wanted) ?? null;
};

/* ------------------------------------------------------------------ *
 * Admin
 * ------------------------------------------------------------------ */

export function adminShopOverview() {
  const state = shop();
  const orders = [...state.orders].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const paid = orders.filter((order) => order.payment.status === 'paid' && order.status !== 'cancelled');
  const open = orders.filter(
    (order) => order.status !== 'delivered' && order.status !== 'cancelled',
  );

  return {
    summary: {
      orders: orders.length,
      open: open.length,
      awaitingPayment: orders.filter((order) => order.payment.status !== 'paid' && order.status !== 'cancelled').length,
      paidOrders: paid.length,
      revenueUsd: Number(paid.reduce((sum, order) => sum + order.total, 0).toFixed(2)),
      recordsSold: orders
        .filter((order) => order.status !== 'cancelled')
        .reduce((sum, order) => sum + order.records, 0),
      unitsLeft: SHOP_RELEASES.reduce((sum, release) => sum + stockOf(release.id), 0),
    },
    orders,
    stock: SHOP_RELEASES.map((release) => ({
      releaseId: release.id,
      title: release.title,
      release: release.release,
      priceUsd: release.priceUsd,
      image: release.image,
      stock: stockOf(release.id),
      sold: Math.max(0, release.stock - stockOf(release.id)),
      lowStock: stockOf(release.id) > 0 && stockOf(release.id) <= 5,
    })),
  };
}

/** Move an order along, or cancel it (which puts the records back on the shelf). */
export function updateShopOrder(id, { status, paymentStatus, note } = {}) {
  const order = findShopOrder(id);
  if (!order) return fail(404, 'Shop order not found.');

  if (status !== undefined && !SHOP_ORDER_STATUSES.includes(status)) {
    return fail(422, `Unknown status "${status}".`);
  }

  const previous = order.status;
  const now = new Date().toISOString();
  let changed = false;

  if (paymentStatus !== undefined) {
    if (!['pending', 'paid'].includes(paymentStatus)) {
      return fail(422, `Unknown payment status "${paymentStatus}".`);
    }
    if (order.payment.status !== paymentStatus) {
      order.payment.status = paymentStatus;
      if (paymentStatus === 'paid') order.payment.paidAt = now;
      changed = true;
      pushShopStatusEvent(order, paymentStatus === 'paid' ? 'payment confirmed' : 'payment reset to pending');
    }
  }

  if (status !== undefined && status !== previous) {
    if (status === 'cancelled' && previous === 'cancelled') {
      return fail(409, 'That order is already cancelled.');
    }
    order.status = status;
    changed = true;

    // Only restore stock on the transition into cancelled, and only for orders
    // that had actually held stock.
    if (status === 'cancelled' && previous !== 'cancelled') {
      for (const item of order.items) {
        writeStock(item.releaseId, stockOf(item.releaseId) + item.quantity);
      }
      order.restockedAt = now;
    }

    pushShopStatusEvent(order, `now ${status}`);
  }

  if (!changed) return { status: 200, body: { order, unchanged: true } };

  order.statusHistory = [
    ...(order.statusHistory ?? []),
    {
      status: order.status,
      at: now,
      by: 'management',
      note: text(note, 200) || 'Updated from the shop console',
    },
  ];
  db_.save();
  return { status: 200, body: { order } };
}

/** Put records back on the shelf (a supplier restock, or an oversell correction). */
export function setReleaseStock(releaseId, quantity) {
  const release = shopReleaseById(releaseId);
  if (!release) return fail(404, 'That record is not in the shop catalogue.');
  const next = Math.floor(Number(quantity));
  if (!Number.isFinite(next) || next < 0) return fail(422, 'Stock must be a whole number, 0 or more.');
  const stock = writeStock(releaseId, next);
  return { status: 200, body: { releaseId, stock } };
}
