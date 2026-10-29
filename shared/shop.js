/**
 * The record shop — what a fan actually buys.
 *
 * The configurator is for an artist pressing their own run; this is the other
 * door: records from the 7H catalogue that already exist, sold one copy at a
 * time to anyone. Prices are retail (per record), stock is finite, and delivery
 * is quoted in USD with a UGX equivalent at the day's rate.
 *
 * Everything here is the single source of truth: the shop page, the API, the
 * admin stock editor and the checkout maths all read this file, so a price or a
 * delivery fee only ever changes in one place.
 */

/** The catalogue format each release was pressed on — mirrors shared/pricing.js. */
const FORMATS = {
  lp_standard: { format: '12" LP · 33⅓ rpm', weight: '140 g black vinyl' },
  lp_colored: { format: '12" LP · 33⅓ rpm', weight: '140 g colour vinyl' },
  seven_single: { format: '7" single · 45 rpm', weight: 'Standard 7" vinyl' },
};

/**
 * Records for sale. `stock` is the opening count — after that the live quantity
 * lives in the store (db.shop.stock) because every sale decrements it.
 */
export const SHOP_RELEASES = [
  {
    id: 'pearl-of-africa',
    title: 'Pearl of Africa',
    release: '7H-041',
    formatId: 'lp_colored',
    colour: 'Lime translucent',
    sleeveId: 'gatefold',
    sleeve: 'Gatefold',
    priceUsd: 52,
    stock: 60,
    image: '/artwork/samples/pearl-of-africa.jpg',
    note: 'Newsprint collage — map, elephant, crested crane',
  },
  {
    id: 'made-in-entebbe',
    title: 'Made in Entebbe',
    release: '7H-038',
    formatId: 'lp_standard',
    colour: 'Black',
    sleeveId: 'standard',
    sleeve: 'Standard jacket',
    priceUsd: 38,
    stock: 80,
    image: '/artwork/samples/made-in-entebbe.jpg',
    note: 'Block green type on hand-scuffed black',
  },
  {
    id: 'proof-of-life',
    title: 'Proof of Life',
    release: '7H-044',
    formatId: 'lp_colored',
    colour: 'Lime translucent',
    sleeveId: 'inner',
    sleeve: 'Printed inner sleeve',
    priceUsd: 48,
    stock: 45,
    image: '/artwork/samples/proof-of-life.jpg',
    note: 'Boda ride through Kampala traffic',
  },
  {
    id: 'with-the-gs',
    title: 'With the Gs',
    release: '7H-047',
    formatId: 'seven_single',
    colour: 'Black',
    sleeveId: 'standard',
    sleeve: 'Standard jacket',
    priceUsd: 22,
    stock: 120,
    image: '/artwork/samples/with-the-gs.jpg',
    note: 'Polaroid-style portrait, hand-brushed mask',
  },
  {
    id: 'badman',
    title: 'Badman',
    release: '7H-050',
    formatId: 'lp_standard',
    colour: 'Black',
    sleeveId: 'gatefold',
    sleeve: 'Gatefold',
    priceUsd: 44,
    stock: 35,
    image: '/artwork/samples/badman.jpg',
    note: 'Green-room session, redacted eyes',
  },
];

/** Nobody needs six copies of the same record from one checkout. */
export const MAX_PER_RELEASE = 5;

/** Where we can actually get a record to, and what it costs. */
export const DELIVERY_OPTIONS = [
  {
    id: 'pickup',
    name: 'Pick up in Kampala',
    detail: 'Ntinda studio, Mon–Sat 09:00–19:00 — bring the order number.',
    eta: 'Ready 2–3 days after payment',
    priceUsd: 0,
    zone: 'uganda',
    requiresAddress: false,
  },
  {
    id: 'kampala',
    name: 'Kampala courier',
    detail: 'Boda courier to your door, any division in Kampala.',
    eta: '1–2 days after packing',
    priceUsd: 3,
    zone: 'uganda',
    requiresAddress: true,
  },
  {
    id: 'uganda',
    name: 'Upcountry Uganda',
    detail: 'Bus or courier to your town — pay on collection if you prefer.',
    eta: '2–4 days after packing',
    priceUsd: 6,
    zone: 'uganda',
    requiresAddress: true,
  },
  {
    id: 'east-africa',
    name: 'East Africa',
    detail: 'Tracked courier to Kenya, Tanzania, Rwanda, Burundi and South Sudan.',
    eta: '5–9 days, tracked',
    priceUsd: 15,
    zone: 'international',
    requiresAddress: true,
  },
  {
    id: 'world',
    name: 'Rest of the world',
    detail: 'Tracked airmail with a customs declaration on the sleeve.',
    eta: '7–14 days, tracked',
    priceUsd: 34,
    zone: 'international',
    requiresAddress: true,
  },
];

/** Payment rails a fan can use — the same three the studio takes. */
export const SHOP_PAYMENT_METHODS = ['mtn_momo', 'airtel_money', 'card_bank'];

export const shopReleaseById = (id) => SHOP_RELEASES.find((release) => release.id === id) ?? null;

export const deliveryOptionById = (id) => DELIVERY_OPTIONS.find((option) => option.id === id) ?? null;

/** A release as the shop page renders it, with the press spec spelled out. */
export function describeRelease(release) {
  const spec = FORMATS[release.formatId] ?? FORMATS.lp_standard;
  return {
    ...release,
    format: spec.format,
    weight: spec.weight,
    maxPerOrder: MAX_PER_RELEASE,
  };
}

/** Every release, priced and described, before live stock is applied. */
export const shopCatalogue = () => SHOP_RELEASES.map(describeRelease);

const clampQuantity = (value) => {
  const quantity = Math.floor(Number(value));
  return Number.isFinite(quantity) ? quantity : 0;
};

/**
 * Price a bag.
 *
 * Pure and synchronous so the API and the client can run the same maths. It
 * validates shape and quantity only — whether the records are actually on the
 * shelf is a server-side stock check at the moment of the order.
 */
export function calculateShopOrder({ items = [], deliveryId, fxRate = 3750 } = {}) {
  const errors = [];
  const lines = [];

  if (!Array.isArray(items) || items.length === 0) {
    errors.push('Add at least one record to the bag.');
  }

  for (const item of Array.isArray(items) ? items : []) {
    const release = shopReleaseById(item?.releaseId);
    if (!release) {
      errors.push('One of those records is no longer in the catalogue.');
      continue;
    }
    const quantity = clampQuantity(item?.quantity);
    if (quantity < 1) {
      errors.push(`Choose a quantity for ${release.title}.`);
      continue;
    }
    if (quantity > MAX_PER_RELEASE) {
      errors.push(`We cap each record at ${MAX_PER_RELEASE} copies per order — ask us about a bigger lot.`);
      continue;
    }
    lines.push({
      releaseId: release.id,
      title: release.title,
      release: release.release,
      image: release.image,
      priceUsd: release.priceUsd,
      quantity,
      lineTotal: Number((release.priceUsd * quantity).toFixed(2)),
    });
  }

  const delivery = deliveryOptionById(deliveryId) ?? null;
  if (!delivery) errors.push('Choose how you want the record delivered.');

  const subtotal = Number(lines.reduce((sum, line) => sum + line.lineTotal, 0).toFixed(2));
  const shipping = delivery ? delivery.priceUsd : 0;
  const total = Number((subtotal + shipping).toFixed(2));
  const records = lines.reduce((sum, line) => sum + line.quantity, 0);

  return {
    valid: errors.length === 0,
    errors,
    lines,
    records,
    subtotal,
    shipping,
    total,
    fxRate,
    delivery,
    totals: {
      subtotal: { usd: subtotal, ugx: Math.round(subtotal * fxRate) },
      shipping: { usd: shipping, ugx: Math.round(shipping * fxRate) },
      total: { usd: total, ugx: Math.round(total * fxRate) },
    },
  };
}

/** One line a shop order reads as in an email, a WhatsApp message or the admin list. */
export function describeShopOrder(order) {
  const records = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const title = order.items.length === 1 ? order.items[0].title : `${order.items[0].title} +${order.items.length - 1}`;
  return `${order.id} · ${records} record${records === 1 ? '' : 's'} (${title}) · $${Number(order.total).toFixed(2)}`;
}

export const SHOP_ORDER_STATUSES = ['placed', 'packed', 'shipped', 'delivered', 'cancelled'];
