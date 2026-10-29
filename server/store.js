import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DEFAULT_FX_UGX_PER_USD, calculateQuote } from '../shared/pricing.js';
import { COMPANY } from './config.js';
import { createDriver } from './db/index.js';
import { clone, emptyDoc, normalizeDoc } from './db/document.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');
// Vercel functions only allow writes under /tmp, so the demo store and uploads
// fall back there automatically. Override with DATA_DIR / UPLOAD_DIR.
const fallbackRoot = process.env.VERCEL ? '/tmp' : ROOT_DIR;
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(fallbackRoot, process.env.VERCEL ? '7h-data' : 'data');
export const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(fallbackRoot, process.env.VERCEL ? '7h-uploads' : 'uploads');

const DB_FILE = path.join(DATA_DIR, 'db.json');

const emptyDb = () => emptyDoc();

// The driver decides where this document actually lives: Postgres, Redis, or a
// file beside the app. It is created once per process and reused across warm
// invocations, which is what makes the connection pool worth having.
const driver = createDriver({
  file: DB_FILE,
  dataDir: DATA_DIR,
  overrides: globalThis.__7H_DB_OVERRIDES__ ?? {},
});

let db = null;
let lastSaved = null;
let booting = null;
let writeChain = Promise.resolve();
let lastReloadAt = 0;
const RELOAD_INTERVAL_MS = Number(process.env.STORE_RELOAD_MS ?? 2500);

export function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const demoQuote = (configuration) => {
  const quote = calculateQuote({ ...configuration, fxRate: DEFAULT_FX_UGX_PER_USD });
  return {
    vinylType: quote.vinylType,
    sleeve: quote.sleeve,
    factoryCost: quote.factoryCost,
    managementFee: quote.managementFee,
    total: quote.total,
    deposit: quote.deposit,
    balance: quote.balance,
    perUnit: quote.perUnit,
    fxRate: quote.fxRate,
    totals: quote.totals,
    lines: quote.lines,
  };
};

function seedDemo(db) {
  const now = Date.now();
  const iso = (offsetMinutes) => new Date(now - offsetMinutes * 60_000).toISOString();

  const demoOneId = '7H-2026-8K2Q';
  const demoTwoId = '7H-2026-3Z7M';

  const uploads = [
    {
      id: 'upl_demo_master',
      originalName: 'NALEDI_master_v3.wav',
      storedName: 'demo-naledi-master.wav',
      mimeType: 'audio/wav',
      size: 48_233_984,
      kind: 'audio',
      demo: true,
      createdAt: iso(190),
    },
    {
      id: 'upl_demo_art',
      originalName: 'NALEDI_cover_CMYK.pdf',
      storedName: 'demo-naledi-cover.pdf',
      mimeType: 'application/pdf',
      size: 7_428_096,
      kind: 'artwork',
      demo: true,
      createdAt: iso(188),
    },
    {
      id: 'upl_demo_master2',
      originalName: 'KAMPALA-NIGHTS_MASTER_24bit.wav',
      storedName: 'demo-kampala-master.wav',
      mimeType: 'audio/wav',
      size: 62_109_120,
      kind: 'audio',
      demo: true,
      createdAt: iso(46),
    },
    {
      id: 'upl_demo_art2',
      originalName: 'KAMPALA-NIGHTS_ARTWORK_v2.pdf',
      storedName: 'demo-kampala-artwork.pdf',
      mimeType: 'application/pdf',
      size: 9_547_776,
      kind: 'artwork',
      demo: true,
      createdAt: iso(44),
    },
  ];

  const orders = [
    {
      id: demoOneId,
      reference: '7H-VINYL',
      createdAt: iso(187),
      status: 'forwarded',
      demo: true,
      client: {
        name: 'Naledi Sound (Label)',
        email: 'a&r@naledisound.com',
        phone: '+256772114455',
        country: 'Uganda',
        deliveryType: 'uganda',
        deliveryAddress: 'Plot 14 Bandali Rise, Bugolobi, Kampala',
        deliveryCity: 'Kampala',
        notes: 'Please confirm test pressing colour before full run.',
      },
      configuration: {
        quantity: 250,
        vinylTypeId: 'lp_colored',
        sleeveId: 'gatefold',
      },
      quote: demoQuote({ quantity: 250, vinylTypeId: 'lp_colored', sleeveId: 'gatefold' }),
      payment: { method: 'mtn_momo', status: 'deposit_paid', reference: 'MOMO-882341' },
      files: {
        audio: [uploads[0]],
        artwork: [uploads[1]],
      },
    },
    {
      id: demoTwoId,
      reference: '7H-VINYL',
      createdAt: iso(42),
      status: 'received',
      demo: true,
      client: {
        name: 'Kampala Nights Collective',
        email: 'booking@kampalanights.co',
        phone: '+256701998877',
        country: 'Uganda',
        deliveryType: 'international',
        deliveryAddress: 'O2 Academy, 16–18 Stoke Newington Rd',
        deliveryCity: 'London, UK',
        notes: 'Deliver to tour city ahead of the London show (vendor drop accepted).',
      },
      configuration: {
        quantity: 500,
        vinylTypeId: 'lp_standard',
        sleeveId: 'inner',
      },
      quote: demoQuote({ quantity: 500, vinylTypeId: 'lp_standard', sleeveId: 'inner' }),
      payment: { method: 'card_bank', status: 'awaiting_deposit', reference: null },
      files: {
        audio: [uploads[2]],
        artwork: [uploads[3]],
      },
    },
  ];

  const events = [
    {
      id: 'evt_demo_1',
      orderId: demoOneId,
      channel: 'slack',
      target: '#7h-orders (Slack)',
      status: 'delivered',
      attempts: 1,
      httpStatus: 200,
      createdAt: iso(186),
      message: `New vinyl order ${demoOneId} — 250 × 12" Colored / Gatefold for Naledi Sound.`,
      payload: null,
    },
    {
      id: 'evt_demo_2',
      orderId: demoOneId,
      channel: 'plant',
      target: 'Mobineko · production intake',
      status: 'delivered',
      attempts: 1,
      httpStatus: 200,
      createdAt: iso(150),
      message: `Order ${demoOneId} forwarded to Mobineko with master + artwork links.`,
      payload: null,
    },
    {
      id: 'evt_demo_3',
      orderId: demoTwoId,
      channel: 'email',
      target: COMPANY.email,
      status: 'delivered',
      attempts: 1,
      httpStatus: 200,
      createdAt: iso(41),
      message: `New vinyl order ${demoTwoId} — 500 × 12" LP Standard / Printed Inner Sleeve.`,
      payload: null,
    },
    {
      id: 'evt_demo_4',
      orderId: demoTwoId,
      channel: 'whatsapp',
      target: `${COMPANY.phone} (Management)`,
      status: 'queued',
      attempts: 0,
      httpStatus: null,
      createdAt: iso(40),
      message: `WhatsApp alert queued for ${demoTwoId}. Awaiting deposit confirmation.`,
      payload: null,
    },
  ];

  return normalizeDoc({ ...db, orders, uploads, events });
}

/**
 * Boot the store.
 *
 * Loads the document from the driver (or seeds it the first time), and only
 * resolves once that has happened — every route awaits this through the
 * middleware in app.js, so no handler ever sees a half-initialised store.
 */
async function boot() {
  await driver.init();
  const stored = await driver.load();
  if (stored) {
    db = stored;
  } else {
    // A real database starts empty — fake sample orders have no place in a shop
    // that is taking money. The file store still seeds the demo so the app has
    // something to show on a laptop, and SEED_DEMO=true forces it anywhere.
    const wantsDemo = !driver.persistent || process.env.SEED_DEMO === 'true';
    db = wantsDemo ? seedDemo(emptyDb()) : emptyDoc();
    await driver.save(null, db);
  }
  lastSaved = clone(db);
  lastReloadAt = Date.now();
  return db;
}

export function storeReady() {
  if (!db) {
    booting = booting ?? boot();
    return booting;
  }
  return Promise.resolve(db);
}

/** The document. Synchronous on purpose: every route already assumes that. */
function load() {
  if (!db) {
    throw new Error('The store is not ready yet — call storeReady() before reading db_.data');
  }
  return db;
}

function persist() {
  const next = load();
  const snapshot = clone(next);
  const previous = lastSaved;
  lastSaved = snapshot;

  writeChain = writeChain
    .then(() => driver.save(previous, snapshot))
    .catch((error) => {
      // Put the document back so the next save retries the same change rather
      // than silently losing it.
      lastSaved = previous;
      console.warn(`[store] Could not save to ${driver.name}:`, error.message);
    });
  return writeChain;
}

/**
 * Pull a fresh copy from the database.
 *
 * Two lambdas can serve two fans at once, so a warm instance's copy can drift.
 * Throttled: at most once every RELOAD_INTERVAL_MS (default 2.5s), which is
 * invisible to a user reading the shop and cheap for the database.
 */
export async function refreshStore({ force = false, canReload = true } = {}) {
  if (!db) await storeReady();
  if (!driver.persistent) return false;
  // Never swap the document under a request that is mid-write: the route may be
  // holding a reference to an order it is about to save.
  if (!canReload) return false;
  const now = Date.now();
  if (!force && now - lastReloadAt < RELOAD_INTERVAL_MS) return false;
  await writeChain.catch(() => {});
  lastReloadAt = now;
  try {
    const fresh = await driver.load();
    if (fresh) {
      db = fresh;
      lastSaved = clone(fresh);
    }
    return true;
  } catch (error) {
    console.warn(`[store] Could not refresh from ${driver.name}:`, error.message);
    return false;
  }
}

export const db_ = {
  get data() {
    return load();
  },
  get driver() {
    return { name: driver.name, label: driver.label, persistent: driver.persistent };
  },
  save() {
    return persist();
  },
  ready() {
    return storeReady();
  },
  refresh(options) {
    return refreshStore(options);
  },
  /** Ours to make atomic: only the database can promise this across instances. */
  async reserve(lines) {
    const doc = load();
    if (!doc.shop) doc.shop = { stock: {}, orders: [] };
    const result = await driver.reserve(lines);
    if (result.ok && result.stock) {
      // Trust the database's numbers, not ours.
      Object.assign(doc.shop.stock, result.stock);
      if (lastSaved?.shop) Object.assign(lastSaved.shop.stock, result.stock);
    }
    return result;
  },
  async setStock(releaseId, value) {
    const doc = load();
    doc.shop.stock[releaseId] = value;
    if (lastSaved?.shop) lastSaved.shop.stock[releaseId] = value;
    await driver.setStock(releaseId, value);
    return value;
  },
  async health() {
    const health = await driver.health();
    return {
      ...health,
      ready: Boolean(db),
      counts: health.counts ?? {
        orders: db?.orders.length ?? 0,
        shopOrders: db?.shop?.orders?.length ?? 0,
        events: db?.events.length ?? 0,
        uploads: db?.uploads.length ?? 0,
      },
    };
  },
  async reset() {
    db = seedDemo(emptyDb());
    lastSaved = null;
    await driver.reset(db);
    lastSaved = clone(db);
    return persist();
  },
  async close() {
    await writeChain.catch(() => {});
    await driver.close();
  },
};

export function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Readable reference a fan can quote on WhatsApp: 7H-SHOP-XXXXXX.
 *
 * Six characters from a 32-symbol alphabet is ~1.07 billion combinations — long
 * enough that the public order page cannot be walked by guessing. Kept distinct
 * from production orders (7H-YYYY-XXXX) on purpose.
 */
export function newShopOrderId(existing = []) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 50; attempt += 1) {
    let tail = '';
    const bytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i += 1) tail += alphabet[bytes[i] % alphabet.length];
    const candidate = `7H-SHOP-${tail}`;
    if (!existing.some((order) => order.id === candidate)) return candidate;
  }
  return `7H-SHOP-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

/** Human-readable, plant-facing order reference: 7H-YYYY-XXXX */
export function newOrderId(existing = []) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 50; attempt += 1) {
    let tail = '';
    const bytes = crypto.randomBytes(4);
    for (let i = 0; i < 4; i += 1) tail += alphabet[bytes[i] % alphabet.length];
    const candidate = `7H-${year}-${tail}`;
    if (!existing.some((order) => order.id === candidate)) return candidate;
  }
  return `7H-${year}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
}
