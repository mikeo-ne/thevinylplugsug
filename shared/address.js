/**
 * Door-to-door addresses.
 *
 * Every order we take — a fan's single record or a label's 1,000-unit run — is
 * manufactured overseas and shipped straight to the customer, so the address on
 * the order is not a billing detail: it is the *shipping label*. The supplier's
 * courier reads exactly what this module prints, which is why the formatting
 * lives in one shared place and the plant email, the desk email and the console
 * all render it the same way.
 *
 * Shared by the browser (review screens) and the API (payloads, emails).
 */
import { formatMoney } from './currency.js';

const clean = (value, max = 200) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';

/**
 * Accepts either the pressing-order shape (`recipientName`, `deliveryAddress`,
 * …) or the shop shape (`address`, `city`, …) and returns one canonical object.
 */
export function normaliseAddressOrder(input = {}) {
  return {
    recipient: clean(input.recipient ?? input.recipientName),
    phone: clean(input.phone),
    email: clean(input.email, 160),
    street: clean(input.street ?? input.address ?? input.deliveryAddress, 300),
    city: clean(input.city ?? input.deliveryCity, 120),
    region: clean(input.region ?? input.deliveryRegion, 120),
    postalCode: clean(input.postalCode ?? input.deliveryPostalCode ?? input.zip, 32),
    country: clean(input.country ?? input.deliveryCountry, 80) || 'Uganda',
    instructions: clean(input.instructions ?? input.notes, 600),
  };
}

/** The address of any order — pressing or shop. */
export function orderAddress(order = {}) {
  const client = order.client ?? {};
  const buyer = order.buyer ?? {};
  const delivery = order.delivery ?? {};
  return normaliseAddressOrder({
    recipient: client.recipientName || buyer.name || client.name,
    phone: buyer.phone || client.phone,
    email: buyer.email || client.email,
    street: delivery.address || client.deliveryAddress,
    city: delivery.city || client.deliveryCity,
    region: delivery.region || client.deliveryRegion,
    postalCode: delivery.postalCode || client.deliveryPostalCode,
    country: delivery.country || client.country,
    instructions: buyer.notes || client.notes,
  });
}

/**
 * The address as a courier label: recipient, phone, street, then
 * "city, region postal" on one line, then the country.
 */
export function addressLines(address) {
  const value = normaliseAddressOrder(address);
  const tail = [value.city, value.region, value.postalCode].filter(Boolean).join(', ');
  return [value.recipient, value.phone, value.street, tail, value.country].filter(Boolean);
}

export const addressBlock = (address) => addressLines(address).join('\n');

/**
 * A supplier-facing drop-ship dispatch slip.
 *
 * Deliberately plain text in a fixed order: suppliers paste these into their
 * own order systems, and a courier reads them off a printout. Returns `null`
 * when there is no postal address (a studio pickup has nothing to dispatch).
 */
export function buildDispatchSlip(order, { plant = null, releasedAt = null, contents = [] } = {}) {
  const address = orderAddress(order);
  if (!address.street && !address.city) return null;

  const shown = {
    recipient: address.recipient || '—',
    phone: address.phone || '—',
    email: address.email || '—',
    street: address.street || '—',
    city: address.city || '—',
    region: address.region || '—',
    postal: address.postalCode || '—',
    country: address.country || '—',
  };

  // Labels are printed capitalised, values are keyed lower-case.
  const label = (name) => `${name.padEnd(12)}${shown[name.toLowerCase()] ?? ''}`;
  const plantLabel = plant ? `${plant.name} — ${plant.region}` : 'To be confirmed';
  const released = releasedAt ? new Date(releasedAt).toISOString().slice(0, 10) : 'on deposit clearance';

  const layout = [
    '7H MUSIC GROUP — DROP-SHIP DISPATCH SLIP',
    'Do not return to sender — this is a direct-to-customer delivery.',
    '',
    `Order        ${order.id}`,
    `Plant        ${plantLabel}`,
    `Released     ${released}`,
    '',
    'SHIP TO',
    label('Recipient'),
    label('Phone'),
    label('Email'),
    label('Street'),
    label('City'),
    label('Region'),
    label('Postal'),
    label('Country'),
  ];

  if (contents.length > 0) {
    layout.push('', 'CONTENTS');
    for (const line of contents) layout.push(`  ${line}`);
  }

  if (address.instructions) {
    layout.push('', 'DELIVERY NOTES', `  ${address.instructions}`);
  }

  layout.push(
    '',
    'Every item is pressed to order for this customer. Address the parcel exactly as above,',
    'mark the customs declaration "pressed vinyl, order ' + order.id + '" and send the tracking',
    'number to orders so we can pass it to the customer.',
  );

  return layout.join('\n');
}

/** A one-line summary for tables and alerts: "Kampala, Central, Uganda". */
export function addressSummary(address) {
  const value = normaliseAddressOrder(address);
  return [value.city, value.region, value.country].filter(Boolean).join(', ');
}

/** Kept for symmetry with the pricing helpers: money on a dispatch slip is USD. */
export const slipMoney = (value) => formatMoney(value, 'USD', { cents: true });
