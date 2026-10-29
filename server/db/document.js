/**
 * The stored document and the diffs we apply to it.
 *
 * The app was written against one in-memory object (`db_.data`) holding arrays
 * of orders, alerts and uploads plus the shop's stock counters. Every driver
 * speaks that same document, so the routes did not have to change when a real
 * database arrived behind them: each save is diffed against the last persisted
 * snapshot and only the rows that actually moved are written.
 *
 * That keeps writes small (a status change touches one row, not the table) and
 * keeps two lambdas from clobbering each other's unrelated rows — the failure
 * mode a naive "write the whole document" design has.
 */
import { SHOP_RELEASES } from '../../shared/shop.js';

export const DOC_VERSION = 2;

export const emptyDoc = () => ({
  version: DOC_VERSION,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  orders: [],
  events: [],
  uploads: [],
  // Retail: live stock counts plus fan orders, apart from the pressing pipeline.
  shop: { stock: {}, orders: [] },
});

export const clone = (value) => (value == null ? value : JSON.parse(JSON.stringify(value)));

/** The opening stock counts, used to seed a fresh database. */
export const seedStock = () =>
  Object.fromEntries(SHOP_RELEASES.map((release) => [release.id, release.stock]));

/**
 * Coerce anything read from storage into a document the routes can trust.
 * A store written by an older version opens cleanly.
 */
export function normalizeDoc(raw) {
  const base = emptyDoc();
  if (!raw || typeof raw !== 'object') return base;

  const doc = {
    ...base,
    ...raw,
    orders: Array.isArray(raw.orders) ? raw.orders : [],
    events: Array.isArray(raw.events) ? raw.events : [],
    uploads: Array.isArray(raw.uploads) ? raw.uploads : [],
    shop: {
      stock: raw.shop && typeof raw.shop.stock === 'object' && raw.shop.stock ? raw.shop.stock : {},
      orders: raw.shop && Array.isArray(raw.shop.orders) ? raw.shop.orders : [],
    },
  };

  // Every catalogue release must have a number, even if the row predates it.
  for (const release of SHOP_RELEASES) {
    if (!Number.isFinite(doc.shop.stock[release.id])) doc.shop.stock[release.id] = release.stock;
  }

  doc.version = DOC_VERSION;
  return doc;
}

/** Rows in `next` that are new or changed since `prev`, plus the ids to delete. */
export function sliceDiff(prev = [], next = []) {
  const before = new Map(prev.map((item) => [item.id, JSON.stringify(item)]));
  const changed = [];
  for (const item of next) {
    const serialised = JSON.stringify(item);
    if (before.get(item.id) !== serialised) changed.push(item);
    before.delete(item.id);
  }
  return { changed, removed: [...before.keys()] };
}

/** Stock counters that moved since the last persist. */
export function stockDiff(prev = {}, next = {}) {
  const changed = [];
  for (const [releaseId, value] of Object.entries(next)) {
    if (prev[releaseId] !== value) changed.push([releaseId, value]);
  }
  return changed;
}

/** The document as a flat set of named slices, so drivers can loop generically. */
export function slicesOf(doc) {
  return {
    orders: doc.orders,
    uploads: doc.uploads,
    events: doc.events,
    shopOrders: doc.shop.orders,
  };
}
