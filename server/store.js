import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { calculateQuote } from '../shared/pricing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const UPLOAD_DIR = path.join(ROOT_DIR, 'uploads');

const DB_FILE = path.join(DATA_DIR, 'db.json');

const emptyDb = () => ({
  version: 1,
  createdAt: new Date().toISOString(),
  orders: [],
  events: [],
  uploads: [],
});

let db = null;
let writeChain = Promise.resolve();

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const demoQuote = (configuration) => {
  const quote = calculateQuote({ ...configuration, fxRate: 3750 });
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
      target: 'press@7hmusicgroup.com',
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
      target: '+256 700 411 700 (Management)',
      status: 'queued',
      attempts: 0,
      httpStatus: null,
      createdAt: iso(40),
      message: `WhatsApp alert queued for ${demoTwoId}. Awaiting deposit confirmation.`,
      payload: null,
    },
  ];

  return { ...db, orders, uploads, events };
}

function load() {
  ensureDirs();
  if (db) return db;
  try {
    if (fs.existsSync(DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      db = { ...emptyDb(), ...parsed };
      return db;
    }
  } catch (error) {
    console.error('[store] Could not read db.json, starting fresh.', error.message);
  }
  db = seedDemo(emptyDb());
  persist();
  return db;
}

function persist() {
  const snapshot = JSON.stringify(db, null, 2);
  writeChain = writeChain.then(async () => {
    try {
      const tmp = `${DB_FILE}.tmp`;
      await fs.promises.writeFile(tmp, snapshot, 'utf8');
      await fs.promises.rename(tmp, DB_FILE);
    } catch (error) {
      console.error('[store] Failed to persist db.json', error.message);
    }
  });
  return writeChain;
}

export const db_ = {
  get data() {
    return load();
  },
  save() {
    return persist();
  },
  reset() {
    db = seedDemo(emptyDb());
    return persist();
  },
};

export function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
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
