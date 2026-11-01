/**
 * 7H Music Group — Express API router.
 *
 * Shared by the standalone server (`server/index.js`) and the Vercel
 * serverless handler (`api/index.js`), so both runtimes expose exactly the
 * same endpoints.
 */
import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  calculateQuote,
  VINYL_TYPES,
  SLEEVE_OPTIONS,
  QUANTITIES,
  QUANTITY_TIERS,
  PRESSING_PLANTS,
  DEFAULT_PLANT_ID,
  MANAGEMENT_FEE_RATE,
  DEPOSIT_RATE,
} from '../shared/pricing.js';
import {
  ADMIN_PASSCODE,
  ADMIN_CONFIG,
  COMPANY,
  FX_UGX_PER_USD,
  MAX_UPLOAD_MB,
  PAYMENT_METHODS,
  SESSION_TTL,
} from './config.js';
import { issueToken, requireAdmin } from './auth.js';
import {
  adminShopOverview,
  findShopOrder,
  placeShopOrder,
  setReleaseStock,
  shopConfig,
  shopOrderView,
  updateShopOrder,
} from './shop.js';
import {
  alertEnvCheck,
  disableTelegramReplies,
  enableTelegramReplies,
  handleTelegramUpdate,
  notificationConfig,
  sendTestAlerts,
  telegramDiscoverChats,
  telegramWebhookInfo,
} from './notifications.js';
import { currentUgxRate, getRates } from './rates.js';
import { BASE_CURRENCY, DISPLAY_CURRENCIES } from '../shared/currency.js';
import { db_, ensureDirs, newOrderId, newId, refreshStore, storeReady, UPLOAD_DIR } from './store.js';
import {
  CHUNK_BYTES,
  chunkStore,
  expectedChunks,
  finaliseUpload,
  folderFor,
  dropUpload,
  openUploadStream,
  readUpload,
  reapAbandonedUploads,
  storageStats,
  uploadUrl,
} from './uploads.js';
import {
  checkDeposit,
  depositUgxFor,
  maskMsisdn,
  normaliseMsisdn,
  paymentsHealth,
  requestDeposit,
  unconfiguredPaymentMessage,
  verifyCallbackSecret,
  walletFeeUgx,
} from './momo.js';
import {
  ensureInvoice,
  invoiceAmounts,
  invoiceStatus,
  invoiceUrl,
  renderInvoiceHtml,
} from './invoices.js';
import {
  alertOutboxSummary,
  automationConfig,
  channelVerification,
  autoForwardOrder,
  buildPlantPayload,
  emitOrderEvents,
  emitTestEvent,
  forwardOrderToPlant,
  getChannelMeta,
  notificationChannels,
  notificationsConfigured,
  plantPayloadText,
  reconcileEvents,
  retryEvent,
  retryFailedAlerts,
  stampAlertProof,
} from './webhooks.js';

const api = express.Router();
api.use(express.json({ limit: '2mb' }));

// How many requests this instance is handling right now. A read refreshes the
// document only when it is the only one — see the readiness middleware below.
let activeRequests = 0;
api.use((req, res, next) => {
  activeRequests += 1;
  res.on('finish', () => {
    activeRequests = Math.max(0, activeRequests - 1);
  });
  next();
});

api.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});

/**
 * Wait for the database, then keep it fresh.
 *
 * The first request after a cold start opens the pool and loads the document;
 * every request after that reuses both. Reads also pull a fresh copy at most
 * once every couple of seconds (throttled inside the store) so a console open in
 * one tab sees an order placed on another lambda instance.
 */
api.use(async (req, res, next) => {
  try {
    await storeReady();
    if (req.method === 'GET') {
      // Only reload when this is the only request in flight on this instance.
      await refreshStore({ canReload: activeRequests === 1 });
    }
    next();
  } catch (error) {
    console.error('[7h] Store unavailable:', error.message);
    res.status(503).json({
      error: 'The database is not reachable right now. Please try again in a moment.',
      code: 'store_unavailable',
    });
  }
});

/* ------------------------------------------------------------------ *
 * Health
 * ------------------------------------------------------------------ */

/**
 * One honest answer to "where does my data live, and is it still there?".
 * Public because it exposes no secrets — just the driver, its latency and row
 * counts — and because an uptime check should be able to read it.
 */
api.get('/api/health', async (req, res) => {
  const database = await db_.health();
  res.status(database.ok ? 200 : 503).json({
    ok: database.ok,
    service: '7h-vinyl-api',
    at: new Date().toISOString(),
    time: new Date().toISOString(),
    runtime: process.env.VERCEL ? 'vercel' : 'node',
    // `path`/`query` make it obvious whether a proxy or rewrite mangled the URL.
    path: req.path,
    query: Object.keys(req.query),
    database,
    // `ready` is the environment; `verified` is proof. A channel can be ready and
    // still unverified — that is the difference between "the variables are set"
    // and "a provider accepted a message with these credentials".
    payments: paymentsHealth().map((rail) => ({
      provider: rail.provider,
      ready: rail.ready,
      environment: rail.environment,
      missing: rail.missing,
    })),
    storage: await storageStats().then((stats) => ({
      driver: stats.driver,
      durable: stats.durable,
      files: stats.files,
      bytes: stats.bytes,
      maxUploadMb: MAX_UPLOAD_MB,
    })),
    alerts: {
      channels: channelVerification().map((entry) => ({
        channel: entry.channel,
        ready: entry.ready,
        verified: entry.verified,
        status: entry.status,
        proofAt: entry.proofAt,
        lastError: entry.lastError,
        missing: entry.missing,
      })),
    },
  });
});

/* ------------------------------------------------------------------ *
 * Uploads — chunked, durable, and filed where you can find them
 * ------------------------------------------------------------------ */

ensureDirs();

const AUDIO_EXT = new Set(['.wav', '.mp3', '.aif', '.aiff', '.flac', '.m4a', '.aac']);
const ART_EXT = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.tif', '.tiff']);
const MAX_FILES_PER_ORDER = 8;

const fileKind = (field) => (field === 'artwork' ? 'artwork' : 'audio');
const extOf = (name) => path.extname(String(name ?? '')).toLowerCase();

const safeBaseName = (name) =>
  path
    .basename(String(name ?? 'file'), path.extname(String(name ?? 'file')))
    .replace(/[^a-z0-9-_]+/gi, '-')
    .slice(0, 48)
    .toLowerCase() || 'file';

/** Which extension sets are allowed, and the sentence to say when one is not. */
function extensionProblem(kind, ext) {
  const allowed = kind === 'artwork' ? ART_EXT : AUDIO_EXT;
  if (allowed.has(ext)) return null;
  return kind === 'artwork'
    ? `Unsupported file type "${ext || 'unknown'}". Artwork must be PDF, JPG, PNG or TIFF.`
    : `Unsupported file type "${ext || 'unknown'}". Audio must be WAV, AIFF, FLAC or MP3.`;
}

/**
 * Start a chunked upload.
 *
 * The browser declares the size up front, which is what lets us refuse a file
 * over the limit before a single byte moves — and what lets it resume a transfer
 * that dropped halfway through a 200 MB master.
 */
api.post('/api/uploads/start', async (req, res) => {
  const body = req.body ?? {};
  const name = text(body.name, 200);
  const size = Number(body.size);
  const kind = fileKind(body.kind ?? body.field);

  if (!name) return res.status(400).json({ error: 'A file name is required.' });
  const problem = extensionProblem(kind, extOf(name));
  if (problem) return res.status(400).json({ error: problem });
  if (!Number.isFinite(size) || size <= 0) return res.status(400).json({ error: 'A file size is required.' });
  if (size > MAX_UPLOAD_MB * 1024 * 1024) {
    return res.status(413).json({
      error: `That file is ${Math.round(size / 1024 / 1024)}MB. The limit is ${MAX_UPLOAD_MB}MB — export a smaller master or split the album.`,
      code: 'file_too_large',
      maxUploadMb: MAX_UPLOAD_MB,
    });
  }

  const db = db_.data;
  const orderId = text(body.orderId, 40).toUpperCase() || null;
  const chunks = expectedChunks(size);
  const now = new Date();

  const record = {
    id: newId('upl'),
    originalName: name,
    storedName: `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeBaseName(name)}${extOf(name)}`,
    mimeType: text(body.mimeType, 120) || 'application/octet-stream',
    size,
    kind,
    orderId,
    folder: folderFor({ orderId, kind, createdAt: now }),
    chunks,
    chunkBytes: CHUNK_BYTES,
    status: 'uploading',
    createdAt: now.toISOString(),
    url: null,
  };

  db.uploads.unshift(record);
  db_.save();

  res.status(201).json({
    upload: { ...record, url: null },
    chunkBytes: CHUNK_BYTES,
    chunks,
  });
});

/**
 * One chunk, raw bytes.
 *
 * Deliberately not multipart: a 3 MB WAV slice is already framed, and multipart
 * would spend a kilobyte of every request on boundaries and headers we drop.
 */
api.put(
  '/api/uploads/:id/chunk/:seq',
  express.raw({ type: '*/*', limit: CHUNK_BYTES + 64 * 1024 }),
  async (req, res) => {
    const db = db_.data;
    const record = db.uploads.find((item) => item.id === req.params.id);
    if (!record) return res.status(404).json({ error: 'Upload not found.' });
    if (record.status === 'complete') return res.status(409).json({ error: 'That upload is already complete.' });

    const seq = Number(req.params.seq);
    if (!Number.isInteger(seq) || seq < 0 || seq >= record.chunks) {
      return res.status(400).json({ error: `Chunk ${req.params.seq} is out of range for this file.` });
    }
    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (buffer.length === 0) return res.status(400).json({ error: 'Empty chunk.' });
    if (buffer.length > CHUNK_BYTES) {
      return res.status(413).json({ error: `Chunks are limited to ${CHUNK_BYTES} bytes.` });
    }

    const store = await chunkStore();
    const written = await store.put(record.id, seq, buffer);
    res.json({ ok: true, seq, bytes: written, received: true });
  },
);

/** Finish: every chunk present, total matches, checksum computed. */
api.post('/api/uploads/:id/complete', async (req, res) => {
  const db = db_.data;
  const record = db.uploads.find((item) => item.id === req.params.id);
  if (!record) return res.status(404).json({ error: 'Upload not found.' });
  if (record.status === 'complete') return res.json({ upload: record });

  const result = await finaliseUpload(record);
  if (!result.ok) return res.status(409).json({ error: result.error, ...result });

  // The client can prove the bytes it sent are the bytes that landed.
  const claimed = text(req.body?.sha256, 64).toLowerCase();
  if (claimed && claimed !== result.sha256) {
    return res.status(409).json({
      error: 'Checksum mismatch — the file that arrived is not the file that was sent. Upload it again.',
      code: 'checksum_mismatch',
      sha256: result.sha256,
    });
  }

  record.status = 'complete';
  record.completedAt = new Date().toISOString();
  record.sha256 = result.sha256;
  record.storage = result.storage;
  record.storageLabel = result.storageLabel;
  record.bytes = result.bytes;
  record.chunks = result.chunks;
  record.url = uploadUrl(record.id);
  db_.save();

  res.json({ upload: record, sha256: result.sha256, storage: result.storageLabel });
});

/**
 * Single-shot upload, kept for small files and existing clients.
 *
 * The bytes still go through the same chunk store, so a 3 MB PDF uploaded this
 * way is just as durable as a 300 MB WAV uploaded in slices.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: MAX_FILES_PER_ORDER },
});

api.post('/api/uploads', (req, res) => {
  upload.fields([
    { name: 'audio', maxCount: 4 },
    { name: 'artwork', maxCount: 4 },
  ])(req, res, async (error) => {
    if (error) {
      const message =
        error.code === 'LIMIT_FILE_SIZE'
          ? `That file is over the ${MAX_UPLOAD_MB}MB single-request limit. Large masters upload in chunks automatically — try again from the order form.`
          : error.message;
      return res.status(400).json({ error: message });
    }

    const files = req.files ?? {};
    const records = [];
    const store = await chunkStore();

    for (const field of ['audio', 'artwork']) {
      for (const file of files[field] ?? []) {
        const problem = extensionProblem(fileKind(field), extOf(file.originalname));
        if (problem) return res.status(400).json({ error: problem });

        const now = new Date();
        const record = {
          id: newId('upl'),
          originalName: file.originalname,
          storedName: `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeBaseName(file.originalname)}${extOf(file.originalname)}`,
          mimeType: file.mimetype,
          size: file.size,
          kind: fileKind(field),
          orderId: text(req.body?.orderId, 40).toUpperCase() || null,
          folder: folderFor({ orderId: text(req.body?.orderId, 40).toUpperCase() || null, kind: fileKind(field), createdAt: now }),
          chunks: expectedChunks(file.size),
          chunkBytes: CHUNK_BYTES,
          createdAt: now.toISOString(),
        };

        for (let index = 0; index < record.chunks; index += 1) {
          const slice = file.buffer.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES);
          await store.put(record.id, index, slice);
        }
        const finalised = await finaliseUpload(record);
        Object.assign(record, {
          status: 'complete',
          completedAt: new Date().toISOString(),
          sha256: finalised.sha256 ?? null,
          storage: finalised.storage ?? store.name,
          storageLabel: finalised.storageLabel ?? store.label,
          bytes: file.size,
          url: uploadUrl(record.id),
        });

        db_.data.uploads.unshift(record);
        records.push(record);
      }
    }

    if (db_.data.uploads.length > 500) db_.data.uploads.length = 500;
    db_.save();

    res.status(201).json({ uploads: records });
  });
});

/** What the order form should tell the client about limits. */
api.get('/api/uploads/limits', async (_req, res) => {
  const storage = await storageStats();
  res.json({
    maxUploadMb: MAX_UPLOAD_MB,
    chunkBytes: CHUNK_BYTES,
    maxFiles: MAX_FILES_PER_ORDER,
    audio: [...AUDIO_EXT],
    artwork: [...ART_EXT],
    storage: { driver: storage.driver, label: storage.label, durable: storage.durable },
  });
});

/** Download. Streams from whichever store holds the bytes. */
api.get('/api/files/:id/download', async (req, res) => {
  const db = db_.data;
  const record =
    db.uploads.find((item) => item.id === req.params.id) ??
    db.uploads.find((item) => item.storedName === req.params.id);

  if (!record) return res.status(404).json({ error: 'File not found.' });

  // Real artist filenames contain em dashes, accents and brackets, and a raw
  // header value throws. RFC 5987: an ASCII fallback plus the UTF-8 original.
  const original = String(record.originalName ?? 'file');
  const ascii = original.replace(/[^\x20-\x7E]+/g, '_').replace(/["\\]/g, '');
  const encoded = encodeURIComponent(original).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`);
  res.setHeader('Content-Type', record.mimeType || 'application/octet-stream');
  if (record.sha256) res.setHeader('X-File-Sha256', record.sha256);
  if (record.size) res.setHeader('Content-Length', String(record.size));

  // Uploaded through the chunk store (durable, and the only path on Vercel).
  // Streamed chunk by chunk so a large master never has to fit in memory.
  if (record.status === 'complete' && record.storage !== 'legacy-disk') {
    const stream = await openUploadStream(record);
    if (stream) {
      const { Readable } = await import('node:stream');
      return Readable.from(stream).pipe(res);
    }
  }

  // Seeded demo records are metadata-only; hand back a signed placeholder so the
  // console still demonstrates the hand-off workflow.
  const filePath = path.join(UPLOAD_DIR, record.storedName);
  if (!fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(
      `7H MUSIC GROUP — DEMO FILE PLACEHOLDER\n\nFile: ${record.originalName}\nKind: ${record.kind}\nBytes: ${record.size}\n\nThis is seeded demo metadata; real client uploads are streamed from storage.\n`,
    );
  }

  return res.sendFile(filePath);
});

/** Metadata without the bytes — what the console's file list reads. */
api.get('/api/files/:id', (req, res) => {
  const db = db_.data;
  const record = db.uploads.find((item) => item.id === req.params.id);
  if (!record) return res.status(404).json({ error: 'File not found.' });
  const { storedName, ...safe } = record;
  res.json({ file: safe });
});

/**
 * Every uploaded file, grouped the way they are stored.
 *
 * This is the "reachable" half of the storage question: the bytes may live in
 * Postgres, but if nobody can see the list, name, size or checksum they are not
 * really filed.
 */
api.get('/api/admin/uploads', requireAdmin, async (_req, res) => {
  const db = db_.data;
  const storage = await storageStats();
  const files = db.uploads.map((record) => ({
    ...record,
    // The disk name is an implementation detail; the id is the handle.
    storedName: undefined,
    downloadUrl: uploadUrl(record.id),
    linkedOrder: record.orderId
      ? db.orders.some((order) => order.id === record.orderId)
        ? record.orderId
        : null
      : null,
  }));

  const groups = {};
  for (const file of files) {
    const key = file.folder ?? folderFor({ orderId: file.orderId, kind: file.kind });
    groups[key] ??= { folder: key, files: [], bytes: 0 };
    groups[key].files.push(file);
    groups[key].bytes += Number(file.size ?? 0);
  }

  res.json({
    storage,
    limits: { maxUploadMb: MAX_UPLOAD_MB, chunkBytes: CHUNK_BYTES },
    files,
    groups: Object.values(groups).sort((a, b) => a.folder.localeCompare(b.folder)),
    counts: {
      files: files.length,
      complete: files.filter((file) => file.status === 'complete').length,
      uploading: files.filter((file) => file.status === 'uploading').length,
      bytes: files.reduce((sum, file) => sum + Number(file.size ?? 0), 0),
    },
  });
});

/** Remove a file and its bytes. */
api.delete('/api/admin/uploads/:id', requireAdmin, async (req, res) => {
  const db = db_.data;
  const index = db.uploads.findIndex((item) => item.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: 'File not found.' });
  const [record] = db.uploads.splice(index, 1);

  // Detach from any order that referenced it, so the plant email cannot point at
  // a file that no longer exists.
  for (const order of db.orders) {
    for (const kind of ['audio', 'artwork']) {
      if (Array.isArray(order.files?.[kind])) {
        order.files[kind] = order.files[kind].filter((file) => file.id !== record.id);
      }
    }
  }
  db_.save();
  await dropUpload(record.id).catch(() => null);
  res.json({ ok: true, removed: record.id });
});

/* ------------------------------------------------------------------ *
 * Public config + quoting
 * ------------------------------------------------------------------ */

api.get('/api/config', (_req, res) => {
  res.json({
    company: COMPANY,
    fxRate: FX_UGX_PER_USD,
    currency: {
      // USD is the base every factory cost, fee and deposit is computed in.
      base: BASE_CURRENCY,
      display: DISPLAY_CURRENCIES,
      // The rate we fall back to when no live quote is available.
      safetyUgxRate: FX_UGX_PER_USD,
    },
    managementFeeRate: MANAGEMENT_FEE_RATE,
    depositRate: DEPOSIT_RATE,
    quantities: QUANTITIES,
    quantityTiers: QUANTITY_TIERS,
    defaultPlantId: DEFAULT_PLANT_ID,
    vinylTypes: VINYL_TYPES,
    sleeves: SLEEVE_OPTIONS,
    paymentMethods: PAYMENT_METHODS,
    plants: PRESSING_PLANTS,
    limits: {
      maxUploadMb: MAX_UPLOAD_MB,
      maxFiles: MAX_FILES_PER_ORDER,
      // Anything bigger than a form post travels in slices of this size.
      chunkBytes: CHUNK_BYTES,
      audio: ['.wav', '.aif', '.aiff', '.flac', '.mp3', '.m4a', '.aac'],
      artwork: ['.pdf', '.jpg', '.jpeg', '.png', '.tif', '.tiff'],
    },
    paymentRails: paymentsHealth().map((rail) => ({
      provider: rail.provider,
      ready: rail.ready,
      environment: rail.environment,
    })),
    deposit: {
      mtn: PAYMENT_METHODS.find((method) => method.id === 'mtn_momo')?.accountNumber ?? null,
      airtel: PAYMENT_METHODS.find((method) => method.id === 'airtel_money')?.accountNumber ?? null,
      accountName: COMPANY.name,
    },
  });
});

/**
 * Live FX.
 *
 * The browser calls this on load and keeps the answer for the session; the
 * server caches it for an hour. `source` tells the UI whether the numbers are
 * live, a recent copy, or the safety rate — it is never silent about which.
 */
api.get('/api/rates', async (_req, res) => {
  const snapshot = await getRates();
  res.json(snapshot);
});

api.post('/api/quote', async (req, res) => {
  const { quantity, vinylTypeId, sleeveId, plantId } = req.body ?? {};
  const quote = calculateQuote({
    quantity,
    vinylTypeId,
    sleeveId,
    plantId,
    fxRate: await currentUgxRate(),
  });
  if (!quote.valid) return res.status(400).json({ error: quote.errors[0], errors: quote.errors });
  return res.json({ quote });
});

/* ------------------------------------------------------------------ *
 * Orders
 * ------------------------------------------------------------------ */

const orderRate = new Map();
function orderRateLimited(ip) {
  const now = Date.now();
  const window = 60_000;
  const hits = (orderRate.get(ip) ?? []).filter((t) => now - t < window);
  hits.push(now);
  orderRate.set(ip, hits);
  return hits.length > 8;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const PHONE_RE = /^\+?[0-9][0-9\s()-]{6,19}$/;

function text(value, max = 400) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function linkOrNull(value) {
  const raw = text(value, 500);
  if (!raw) return null;
  if (!/^https?:\/\/[^\s]+\.[^\s]{2,}$/i.test(raw)) return 'invalid';
  return raw;
}

api.post('/api/orders', async (req, res) => {
  const ip = req.ip ?? 'unknown';
  if (orderRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many submissions. Please try again in a minute.' });
  }

  const body = req.body ?? {};
  const client = body.client ?? {};
  const configuration = body.configuration ?? {};
  const payment = body.payment ?? {};
  const uploadIds = body.uploads ?? {};

  const requestedPlant = PRESSING_PLANTS.some((plant) => plant.id === body.plantPreference)
    ? body.plantPreference
    : configuration.plantId;
  const quote = calculateQuote({
    quantity: configuration.quantity,
    vinylTypeId: configuration.vinylTypeId,
    sleeveId: configuration.sleeveId,
    plantId: requestedPlant,
    fxRate: await currentUgxRate(),
  });
  if (!quote.valid) return res.status(400).json({ error: quote.errors[0] });

  const errors = {};
  const name = text(client.name, 120);
  const email = text(client.email, 160);
  const phone = text(client.phone, 30).replace(/\s+/g, ' ');
  const deliveryType = client.deliveryType === 'international' ? 'international' : 'uganda';
  const recipientName = text(client.recipientName, 120) || name;
  const deliveryAddress = text(client.deliveryAddress, 300);
  const deliveryCity = text(client.deliveryCity, 120);
  const deliveryRegion = text(client.deliveryRegion, 120);
  const deliveryPostalCode = text(client.deliveryPostalCode, 32);
  const country = text(client.country, 80) || (deliveryType === 'uganda' ? 'Uganda' : '');
  const notes = text(client.notes, 1200);

  if (name.length < 2) errors.name = 'Enter the artist or label name.';
  if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid contact email.';
  if (!PHONE_RE.test(phone)) errors.phone = 'Enter a WhatsApp number with country code.';
  if (recipientName.length < 2) errors.recipientName = 'Who signs for the parcel?';
  if (deliveryAddress.length < 6) errors.deliveryAddress = 'Add the street, plot number and area.';
  if (deliveryCity.length < 2) errors.deliveryCity = 'Add the city.';
  if (deliveryRegion.length < 2) {
    errors.deliveryRegion = 'Add the region, state or county — couriers need it.';
  }
  if (deliveryType === 'international' && country.length < 2) {
    errors.country = 'Add the delivery country.';
  }
  if (!PAYMENT_METHODS.some((method) => method.id === payment.method)) {
    errors.paymentMethod = 'Choose a payment method.';
  }
  if (!body.termsAccepted) errors.terms = 'You must accept the production terms.';

  const audioLink = linkOrNull(body.audioLink);
  const artworkLink = linkOrNull(body.artworkLink);
  if (audioLink === 'invalid') errors.audioLink = 'Enter a full https:// link.';
  if (artworkLink === 'invalid') errors.artworkLink = 'Enter a full https:// link.';

  const db = db_.data;
  const resolveUploads = (ids) =>
    (Array.isArray(ids) ? ids : [])
      .map((id) => db.uploads.find((record) => record.id === id || record.storedName === id))
      .filter(Boolean);

  const audioFiles = resolveUploads(uploadIds.audio);
  const artworkFiles = resolveUploads(uploadIds.artwork);

  if (audioFiles.length === 0 && !audioLink) {
    errors.audio = 'Attach at least one master audio file or paste a download link.';
  }
  if (artworkFiles.length === 0 && !artworkLink) {
    errors.artwork = 'Attach the CMYK artwork or paste a download link.';
  }

  if (Object.keys(errors).length > 0) {
    return res.status(422).json({ error: 'Please check the highlighted fields.', errors });
  }

  const order = {
    id: newOrderId(db.orders.map((item) => item.id)),
    createdAt: new Date().toISOString(),
    status: 'received',
    demo: false,
    client: {
      name,
      email,
      phone,
      country: country || 'Uganda',
      deliveryType,
      recipientName,
      deliveryAddress,
      deliveryCity,
      deliveryRegion,
      deliveryPostalCode,
      notes,
    },
    configuration: {
      quantity: quote.quantity,
      vinylTypeId: configuration.vinylTypeId,
      sleeveId: configuration.sleeveId,
      plantId: quote.plant.id,
    },
    quote: {
      vinylType: quote.vinylType,
      sleeve: quote.sleeve,
      plant: quote.plant,
      factoryCost: quote.factoryCost,
      managementFee: quote.managementFee,
      total: quote.total,
      deposit: quote.deposit,
      balance: quote.balance,
      perUnit: quote.perUnit,
      fxRate: quote.fxRate,
      totals: quote.totals,
      lines: quote.lines,
    },
    payment: {
      method: payment.method,
      payerPhone: text(payment.payerPhone, 30) || phone,
      payerName: text(payment.payerName, 120) || name,
      status: payment.method === 'card_bank' ? 'awaiting_deposit' : 'processing',
      reference: payment.method === 'card_bank' ? null : `${payment.method === 'mtn_momo' ? 'MOMO' : 'AIRTEL'}-${Math.floor(Math.random() * 900000 + 100000)}`,
    },
    plantPreference: quote.plant.id,
    files: {
      audio: audioFiles,
      artwork: artworkFiles,
      audioLink: audioLink && audioLink !== 'invalid' ? audioLink : null,
      artworkLink: artworkLink && artworkLink !== 'invalid' ? artworkLink : null,
    },
    termsAcceptedAt: new Date().toISOString(),
    statusHistory: [{ status: 'received', at: new Date().toISOString(), by: 'client', note: 'Order submitted' }],
    clientUserAgent: text(req.headers['user-agent'], 200),
  };

  // The invoice is numbered the moment the order exists, so the client leaves the
  // form holding a reference that is already a document (see server/invoices.js).
  ensureInvoice(order, db);
  db.orders.unshift(order);
  db_.save();

  order.plantPayload = buildPlantPayload(order);
  db_.save();
  await emitOrderEvents(order);
  // No deposit, no plant. The order sits with us until an admin confirms the
  // 50% deposit, which is what triggers the release (see /payment below).

  res.status(201).json({
    order: {
      ...order,
      plantPayloadText: plantPayloadText(order),
    },
    quote,
  });
});

/* ------------------------------------------------------------------ *
 * Deposit collection — a real prompt on a real phone
 * ------------------------------------------------------------------ */

const depositRate = new Map();
/** Three prompts in ten minutes per order is enough; more is harassment. */
function depositRateLimited(key) {
  const now = Date.now();
  const hits = (depositRate.get(key) ?? []).filter((at) => now - at < 10 * 60 * 1000);
  hits.push(now);
  depositRate.set(key, hits);
  return hits.length > 3;
}

const depositUsd = (order) => Number(order?.quote?.deposit ?? 0);
const ugxRate = (order) => Number(order?.quote?.fxRate ?? FX_UGX_PER_USD);

const intentView = (intent) => ({
  id: intent.id,
  provider: intent.provider,
  status: intent.status,
  amountUgx: intent.amountUgx,
  amountUsd: intent.amountUsd,
  paidUgx: intent.paidUgx ?? null,
  feeUgx: intent.feeUgx ?? null,
  reference: intent.referenceId,
  payerMasked: intent.payerMasked,
  requestedAt: intent.requestedAt,
  checkedAt: intent.checkedAt ?? null,
  settledAt: intent.settledAt ?? null,
  error: intent.error ?? null,
  message: intent.message ?? null,
  confirmedDeposit: Boolean(intent.confirmedDeposit),
});

/**
 * Fold a provider answer into the order.
 *
 * SUCCESSFUL is the only status that records money, and even then the deposit is
 * not "confirmed" until somebody in the console says so — unless the desk has
 * explicitly opted into automatic confirmation (`MOMO_AUTO_CONFIRM=true`), which
 * still demands the collected amount cover the whole 50%.
 */
async function settleIntent(order, intent, result) {
  intent.checkedAt = result.checkedAt ?? new Date().toISOString();
  intent.providerStatus = result.status;

  if (result.status === 'SUCCESSFUL') {
    const currency = String(result.currency ?? intent.currency ?? 'UGX').toUpperCase();
    const paid = Number(result.amount ?? intent.amountUgx);
    intent.status = 'successful';
    intent.settledAt = intent.settledAt ?? new Date().toISOString();
    intent.paidUgx = Number.isFinite(paid) ? paid : intent.amountUgx;

    order.payment.collected = {
      provider: intent.provider,
      intentId: intent.id,
      currency,
      amount: intent.paidUgx,
      amountUsd: Math.round((intent.paidUgx / ugxRate(order)) * 100) / 100,
      at: intent.settledAt,
    };
    if (currency !== 'UGX') intent.error = `The wallet charged in ${currency}; confirm the UGX amount by hand.`;

    const due = depositUgxFor(order);
    const autoConfirm = String(process.env.MOMO_AUTO_CONFIRM ?? 'false').toLowerCase() === 'true';
    const coversDeposit = currency === 'UGX' && intent.paidUgx + 1 >= due;

    if (autoConfirm && coversDeposit) {
      const required = depositUsd(order);
      order.payment.status = 'deposit_paid';
      order.payment.depositPaidUsd = required;
      order.payment.paidAt = intent.settledAt;
      order.payment.confirmedAt = intent.settledAt;
      order.payment.confirmedBy = 'momo-collection';
      order.payment.confirmationNote = `${intent.provider} collected UGX ${intent.paidUgx.toLocaleString()} (auto-confirmed)`;
      order.status = order.status === 'received' ? 'confirmed' : order.status;
      intent.confirmedDeposit = true;
      intent.autoConfirmed = true;
      db_.save();
      const release = await autoForwardOrder(order, { trigger: 'deposit' });
      intent.release = release.skipped ? null : { plant: release.plant.name, delivery: release.delivery };
    } else {
      // Money arrived; the console decides what that means. This is the standing
      // rule — suppliers are only contacted once the deposit is confirmed by the
      // desk, not by a webhook.
      order.payment.status = order.payment.status === 'deposit_paid' ? order.payment.status : 'processing';
      order.payment.awaitingConfirmation = {
        reason: 'wallet-collected',
        amountUgx: intent.paidUgx,
        dueUgx: due,
        at: intent.settledAt,
      };
      db_.save();
    }
  } else if (result.status === 'FAILED') {
    intent.status = 'failed';
    intent.error = result.reason ?? 'The wallet declined the request.';
  } else {
    intent.status = 'pending';
  }

  db_.save();
  return intent;
}

/**
 * Ask for the deposit. Public, because the client is the one who must approve the
 * prompt — but it will only ever ring the number already on the order, and only
 * for the deposit that order is actually short of.
 */
api.post('/api/orders/:id/deposit/request', async (req, res) => {
  const db = db_.data;
  const order = db.orders.find((item) => item.id.toUpperCase() === String(req.params.id).toUpperCase());
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  if (['deposit_paid', 'paid'].includes(order.payment?.status)) {
    return res.status(409).json({ error: 'The deposit on this order is already recorded.', code: 'already_paid' });
  }

  const provider = text(req.body?.provider, 20) || order.payment?.method;
  if (!['mtn_momo', 'airtel_money'].includes(provider)) {
    return res.status(400).json({ error: 'Choose MTN MoMo or Airtel Money for an automatic prompt.' });
  }
  if (depositRateLimited(`${order.id}:${req.ip ?? 'unknown'}`)) {
    return res.status(429).json({ error: 'Too many payment prompts for this order. Wait ten minutes or dial the merchant number.' });
  }

  // The prompt may only ring the wallet already on file, so this endpoint cannot
  // be used to spam arbitrary numbers.
  const requested = normaliseMsisdn(req.body?.payerPhone ?? order.payment?.payerPhone ?? order.client?.phone);
  const onFile = normaliseMsisdn(order.payment?.payerPhone ?? order.client?.phone);
  if (!requested) return res.status(400).json({ error: 'Enter the mobile money number to charge.' });
  if (onFile && requested !== onFile) {
    return res.status(403).json({
      error: 'That number is not the one on this order. Message the desk on WhatsApp to change the paying wallet.',
      code: 'payer_mismatch',
    });
  }

  const due = depositUgxFor(order);
  const result = await requestDeposit({
    provider,
    amountUgx: due,
    payerPhone: requested,
    orderId: order.id,
    depositDueUgx: due,
  });

  if (result.status === 'unconfigured' || result.status === 'failed') {
    const view = {
      status: result.status,
      provider,
      error: result.error,
      missing: result.missing ?? [],
      // What to do instead — never a dead end.
      manual: {
        accountName: PAYMENT_METHODS.find((method) => method.id === provider)?.accountName ?? COMPANY.name,
        merchantNumber: PAYMENT_METHODS.find((method) => method.id === provider)?.accountNumber ?? null,
        reference: order.id,
        amountUgx: due,
      },
    };
    return res.status(result.status === 'unconfigured' ? 503 : 502).json(view);
  }

  const intent = {
    id: newId('pay'),
    provider,
    status: 'pending',
    referenceId: result.referenceId,
    amountUgx: due,
    amountUsd: depositUsd(order),
    currency: result.currency ?? 'UGX',
    feeUgx: walletFeeUgx(due),
    payer: result.payer,
    payerMasked: result.payerMasked ?? maskMsisdn(result.payer),
    environment: result.environment ?? null,
    requestedAt: result.requestedAt,
    message: result.message,
  };

  order.payment.method = provider;
  order.payment.payerPhone = result.payer;
  order.payment.momo = order.payment.momo ?? {};
  order.payment.intents = [intent, ...(order.payment.intents ?? [])].slice(0, 10);
  if (order.payment.status === 'awaiting_deposit') order.payment.status = 'processing';
  db_.save();

  res.status(202).json({
    intent: intentView(intent),
    due: { amountUgx: due, amountUsd: depositUsd(order), feeUgx: walletFeeUgx(due) },
    message: intent.message,
  });
});

/** Poll the provider. The client's own page calls this while it waits. */
api.get('/api/orders/:id/deposit/:intentId', async (req, res) => {
  const db = db_.data;
  const order = db.orders.find((item) => item.id.toUpperCase() === String(req.params.id).toUpperCase());
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  const intent = (order.payment?.intents ?? []).find((item) => item.id === req.params.intentId);
  if (!intent) return res.status(404).json({ error: 'Payment request not found.' });

  if (intent.status === 'pending' || intent.status === 'unknown') {
    const result = await checkDeposit(intent.provider, intent.referenceId);
    if (result.status === 'unconfigured') {
      return res.status(503).json({ intent: intentView(intent), error: unconfiguredPaymentMessage(intent.provider, result.missing) });
    }
    if (result.error) intent.error = result.error;
    else await settleIntent(order, intent, result);
  }

  res.json({
    intent: intentView(intent),
    payment: { status: order.payment.status, confirmedBy: order.payment.confirmedBy ?? null },
    // The client is told what happens next, not just a status word.
    next:
      intent.status === 'successful'
        ? order.payment.status === 'deposit_paid'
          ? 'Deposit recorded — your run is released for proofing.'
          : 'Payment received. Management confirms it in the console, usually within the hour.'
        : intent.status === 'failed'
          ? 'That prompt was declined or expired. You can request another, or dial the merchant number.'
          : 'Waiting for you to approve the prompt on your phone.',
  });
});

/**
 * Provider callback.
 *
 * MTN posts the outcome to X-Callback-Url. It cannot carry an admin token, so it
 * carries a secret derived from the subscription key — the same pattern as the
 * Telegram webhook. A bad secret is ignored with a 200 so a prober learns nothing
 * and the provider stops retrying.
 */
api.post('/api/payments/momo/callback/:orderId', async (req, res) => {
  const provider = String(req.body?.provider ?? 'mtn_momo');
  const provided = req.headers['x-callback-secret'] ?? req.query.secret;
  if (!verifyCallbackSecret(provider, provided)) return res.json({ ok: true });

  const db = db_.data;
  const order = db.orders.find((item) => item.id.toUpperCase() === String(req.params.orderId).toUpperCase());
  if (!order) return res.json({ ok: true });

  const reference = text(req.body?.referenceId ?? req.body?.financialTransactionId ?? req.body?.id, 80);
  const intent =
    (order.payment?.intents ?? []).find((item) => item.referenceId === reference) ??
    (order.payment?.intents ?? [])[0];
  if (!intent) return res.json({ ok: true });

  const status = String(req.body?.status ?? '').toUpperCase();
  await settleIntent(order, intent, {
    status: status === 'SUCCESSFUL' ? 'SUCCESSFUL' : status === 'FAILED' ? 'FAILED' : 'PENDING',
    amount: req.body?.amount ?? intent.amountUgx,
    currency: req.body?.currency ?? 'UGX',
    reason: req.body?.reason ?? null,
    checkedAt: new Date().toISOString(),
  });
  res.json({ ok: true });
});

/** Which rails can take money — public, because the order form needs it. */
api.get('/api/payments/rails', (_req, res) => {
  res.json({ rails: paymentsHealth() });
});

/**
 * The invoice, as a printable page.
 *
 * Public by order reference, exactly like `GET /api/orders/:id` — the reference is
 * the secret, and the client needs to open this on a phone without logging in.
 * It is also the link that goes into the WhatsApp hand-off, and `noindex` keeps it
 * out of search results.
 */
api.get('/api/orders/:id/invoice', (req, res) => {
  reconcileEvents();
  const db = db_.data;
  const order = db.orders.find((item) => item.id.toUpperCase() === String(req.params.id).toUpperCase());
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  const before = order.invoice?.number;
  const invoice = ensureInvoice(order, db);
  if (!before) db_.save();

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.type('text/html').send(renderInvoiceHtml(order, invoice));
});

api.get('/api/orders/:id', (req, res) => {
  reconcileEvents();
  const db = db_.data;
  const order = db.orders.find((item) => item.id.toUpperCase() === String(req.params.id).toUpperCase());
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  // Clients see a sanitised view of their own notification fan-out.
  const plantName =
    PRESSING_PLANTS.find((plant) => plant.id === order.plantPreference)?.name ?? 'Mobineko';
  const clientCopy = (channel, status) => {
    const sent = status === 'delivered';
    switch (channel) {
      case 'slack':
        return sent ? 'Operations channel alerted in Slack.' : 'Slack alert queued for the ops channel.';
      case 'email':
        return sent
          ? 'Order sheet emailed to the 7H production desk.'
          : 'Order sheet queued for the 7H production desk.';
      case 'whatsapp':
        return sent
          ? 'WhatsApp alert delivered to 7H management.'
          : 'WhatsApp alert queued for 7H management.';
      case 'plant':
        return `Spec sheet prepared for ${plantName} — released once the deposit clears.`;
      default:
        return 'Notification queued.';
    }
  };

  const events = db.events
    .filter((event) => event.orderId === order.id)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map(({ id, channel, target, status, createdAt, deliveredAt }) => ({
      id,
      channel,
      target: channel === 'plant' ? `${plantName} · production intake` : '7H Music Group · operations',
      status,
      message: clientCopy(channel, status),
      createdAt,
      deliveredAt,
    }));

  // A legacy or demo order gets its number the first time anyone looks at it.
  const beforeInvoice = order.invoice?.number;
  const invoice = ensureInvoice(order, db);
  if (!beforeInvoice) db_.save();

  res.json({
    order: {
      id: order.id,
      createdAt: order.createdAt,
      status: order.status,
      client: order.client,
      configuration: order.configuration,
      quote: order.quote,
      payment: {
        method: order.payment.method,
        status: order.payment.status,
        reference: order.payment.reference ?? null,
      },
      files: {
        audio: order.files.audio,
        artwork: order.files.artwork,
        audioLink: order.files.audioLink,
        artworkLink: order.files.artworkLink,
      },
      plantPreference: order.plantPreference,
      statusHistory: order.statusHistory ?? [],
      invoice: {
        number: invoice.number,
        issuedAt: invoice.issuedAt,
        status: invoiceStatus(order),
        url: invoiceUrl(order),
        amounts: (() => {
          const amounts = invoiceAmounts(order);
          return {
            totalUsd: amounts.total,
            depositUsd: amounts.deposit,
            paidUsd: amounts.paidUsd,
            awaitingUsd: amounts.awaitingUsd,
            outstandingUsd: amounts.outstandingUsd,
            balanceUsd: amounts.balance,
          };
        })(),
      },
    },
    events,
  });
});

/* ------------------------------------------------------------------ *
 * Shop — records sold to fans
 * ------------------------------------------------------------------ */

// A fan tapping "Place order" twice — or retrying after a failed prompt — is the
// common case, not abuse, so the ceiling is generous. Override it for load tests.
const SHOP_ORDERS_PER_MINUTE = Math.max(1, Number(process.env.SHOP_ORDERS_PER_MINUTE ?? 12));
const shopRate = new Map();
function shopRateLimited(ip) {
  const now = Date.now();
  const window = 60_000;
  const hits = (shopRate.get(ip) ?? []).filter((t) => now - t < window);
  hits.push(now);
  shopRate.set(ip, hits);
  return hits.length > SHOP_ORDERS_PER_MINUTE;
}

api.get('/api/shop', async (_req, res) => {
  res.json(shopConfig(await currentUgxRate()));
});

api.post('/api/shop/orders', async (req, res) => {
  const ip = req.ip ?? 'unknown';
  if (shopRateLimited(ip)) {
    return res.status(429).json({ error: 'That is a lot of orders — give it a minute and try again.' });
  }

  const result = await placeShopOrder(
    { ...(req.body ?? {}), userAgent: req.headers['user-agent'] },
    await currentUgxRate(),
  );
  return res.status(result.status).json(result.body);
});

// Reference lookups are the only public read of an order, so they are rate
// limited: six characters is a billion combinations, but a wall costs nothing.
const shopLookup = new Map();
function shopLookupLimited(ip) {
  const now = Date.now();
  const window = 60_000;
  const hits = (shopLookup.get(ip) ?? []).filter((t) => now - t < window);
  hits.push(now);
  shopLookup.set(ip, hits);
  return hits.length > 30;
}

api.get('/api/shop/orders/:id', (req, res) => {
  if (shopLookupLimited(req.ip ?? 'unknown')) {
    return res.status(429).json({ error: 'Too many lookups — wait a minute and try again.' });
  }
  const order = findShopOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found. Check the reference on your receipt.' });
  res.json({ order: shopOrderView(order) });
});

/* ------------------------------------------------------------------ *
 * Admin
 * ------------------------------------------------------------------ */

// The console code is never displayed anywhere, so give brute force a real wall:
// 6 attempts per IP per 10 minutes, reset on success.
const loginRate = new Map();
function loginBlocked(ip) {
  const now = Date.now();
  const windowMs = 10 * 60_000;
  const hits = (loginRate.get(ip) ?? []).filter((entry) => now - entry < windowMs);
  loginRate.set(ip, hits);
  return hits.length >= 6;
}

api.post('/api/admin/login', (req, res) => {
  const ip = req.ip ?? 'unknown';
  if (loginBlocked(ip)) {
    return res
      .status(429)
      .json({ error: 'Too many attempts. Try again in ten minutes.' });
  }

  const passcode = text(req.body?.passcode, 80);
  if (!passcode || passcode.toUpperCase() !== ADMIN_PASSCODE.toUpperCase()) {
    loginRate.get(ip).push(Date.now());
    return res.status(401).json({ error: 'Incorrect access code.' });
  }

  loginRate.delete(ip);
  res.json({ token: issueToken(), expiresIn: SESSION_TTL, operator: '7H Operations' });
});

function decorateOrder(order) {
  const quote = calculateQuote({
    quantity: order.configuration.quantity,
    vinylTypeId: order.configuration.vinylTypeId,
    sleeveId: order.configuration.sleeveId,
    fxRate: order.quote.fxRate ?? FX_UGX_PER_USD,
  });
  return {
    ...order,
    quote: {
      ...order.quote,
      vinylType: order.quote.vinylType ?? (quote.valid ? quote.vinylType : null),
      sleeve: order.quote.sleeve ?? (quote.valid ? quote.sleeve : null),
    },
    plantPayload: buildPlantPayload(order),
    plantPayloadText: plantPayloadText(order),
    // The console always sees the margin, even though client documents never do.
    margin: {
      managementFeeUsd: order.quote.managementFee ?? null,
      rate: order.quote.managementFeeRate ?? null,
    },
    invoice: order.invoice
      ? {
          number: order.invoice.number,
          issuedAt: order.invoice.issuedAt,
          status: invoiceStatus(order),
          url: invoiceUrl(order),
        }
      : null,
  };
}

api.get('/api/admin/session', requireAdmin, (_req, res) => res.json({ ok: true }));

api.get('/api/admin/overview', requireAdmin, (_req, res) => {
  reconcileEvents();
  const db = db_.data;
  const orders = db.orders;
  const pipeline = orders.filter((order) => order.status !== 'delivered' && order.status !== 'cancelled');

  res.json({
    summary: {
      orders: orders.length,
      pipelineValueUsd: Number(pipeline.reduce((sum, order) => sum + order.quote.total, 0).toFixed(2)),
      collectedUsd: Number(
        orders
          .filter((order) => order.payment.status === 'deposit_paid')
          .reduce((sum, order) => sum + order.quote.deposit, 0)
          .toFixed(2),
      ),
      awaitingAction: orders.filter((order) => order.status === 'received').length,
      forwarded: orders.filter((order) => order.status === 'forwarded').length,
      units: orders.reduce((sum, order) => sum + order.configuration.quantity, 0),
      undeliveredEvents: db.events.filter((event) => event.status !== 'delivered').length,
    },
    events: db.events.slice(0, 60),
    orders: orders.map(decorateOrder),
    config: ADMIN_CONFIG,
    plants: PRESSING_PLANTS,
    channels: notificationChannels(),
    notifications: {
      configured: notificationsConfigured(),
      channels: notificationChannels(),
    },
    automation: {
      ...automationConfig(),
      plants: PRESSING_PLANTS.map((plant) => ({
        id: plant.id,
        name: plant.name,
        region: plant.region,
        moq: plant.moq,
        leadTime: plant.leadTime,
        ordersEmail: plant.ordersEmail ?? null,
        // The plant's own inbox — the forwarding target when ordersEmail is us.
        repEmail: plant.repEmail ?? null,
        // True if a plant inbox happens to be the desk address, so the console
        // (and the BCC logic) know not to expect a separate copy.
        aliasesDesk: Boolean(
          plant.ordersEmail &&
            notificationConfig().emailTo
              .split(',')
              .map((address) => address.trim().toLowerCase())
              .includes(plant.ordersEmail.toLowerCase()),
        ),
      })),
    },
  });
});

api.get('/api/admin/events', requireAdmin, (req, res) => {
  reconcileEvents();
  const since = req.query.since ? new Date(String(req.query.since)).getTime() : 0;
  const events = db_.data.events
    .filter((event) => new Date(event.createdAt).getTime() > since || event.status !== 'delivered')
    .slice(0, 80);
  res.json({ events, serverTime: new Date().toISOString() });
});

const ORDER_STATUSES = new Set([
  'received',
  'confirmed',
  'forwarded',
  'in_production',
  'shipped',
  'delivered',
  'cancelled',
]);

api.patch('/api/admin/orders/:id', requireAdmin, async (req, res) => {
  const db = db_.data;
  const order = db.orders.find((item) => item.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  const { status, paymentStatus } = req.body ?? {};
  if (status && !ORDER_STATUSES.has(status)) return res.status(400).json({ error: 'Unknown status.' });
  if (paymentStatus && !['awaiting_deposit', 'processing', 'deposit_paid', 'paid'].includes(paymentStatus)) {
    return res.status(400).json({ error: 'Unknown payment status.' });
  }

  // "At plant" and "in production" are claims about the supplier. Only the
  // forward that actually emailed them may make that claim — otherwise a status
  // dropdown could tell the studio a plant has the order when it has never been
  // contacted.
  if (status && ['forwarded', 'in_production'].includes(status) && order.plantHandoff?.status !== 'delivered') {
    return res.status(409).json({
      error: 'That status is earned, not set: release the order to the plant first (deposit confirmed).',
      code: 'plant_not_released',
    });
  }

  // Confirming the deposit from here is allowed, but it records the money and
  // goes through the same gate as the payment endpoint — one code path, one
  // truth about whether a supplier was contacted.
  let release = null;
  if (paymentStatus === 'deposit_paid' || paymentStatus === 'paid') {
    const amount = Number(req.body?.amount);
    const required = Number(order.quote?.deposit ?? 0);
    const paid = Number.isFinite(amount) && amount > 0 ? amount : required;
    if (Math.round((required - paid) * 100) / 100 > 0.005) {
      return res.status(409).json({
        error: `That is ${paid.toFixed(2)} USD against a ${required.toFixed(2)} USD deposit. Record the full deposit before releasing the order.`,
        code: 'deposit_incomplete',
      });
    }
    order.payment.depositPaidUsd = paid;
    order.payment.paidAt = new Date().toISOString();
  }

  if (status) {
    order.status = status;
    order.statusHistory = [
      ...(order.statusHistory ?? []),
      { status, at: new Date().toISOString(), by: 'management', note: 'Manual update from console' },
    ];
  }
  if (paymentStatus) {
    order.payment.status = paymentStatus;
    order.payment.confirmedAt = new Date().toISOString();
    order.payment.confirmedBy = 'console';
  }
  db_.save();
  if (paymentStatus === 'deposit_paid' || paymentStatus === 'paid') {
    release = await autoForwardOrder(order, { trigger: 'deposit' });
  }
  res.json({
    order: decorateOrder(order),
    ...(release ? { release: release.skipped ? release : { plant: release.plant.name } } : {}),
  });
});

api.post('/api/admin/orders/:id/forward', requireAdmin, async (req, res) => {
  const db = db_.data;
  const order = db.orders.find((item) => item.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  const plantId = PRESSING_PLANTS.some((plant) => plant.id === req.body?.plantId)
    ? req.body.plantId
    : order.plantPreference ?? 'mobineko';
  // forwardOrderToPlant enforces the gate and records the hold on the console,
  // so the refusal is both visible and impossible to bypass.
  const { order: updated, plant, blocked } = await forwardOrderToPlant(order, plantId);
  if (blocked) {
    return res.status(409).json({
      error: 'Confirm the deposit first — suppliers are only contacted once the deposit is paid.',
      code: 'deposit_required',
      paymentStatus: order.payment?.status ?? 'pending',
    });
  }
  res.json({ order: decorateOrder(updated), plant });
});

/**
 * Console: ask for the deposit on the number already on file.
 *
 * Same code path as the client button — one implementation, one truth about what
 * MTN or Airtel actually said.
 */
api.post('/api/admin/orders/:id/deposit/request', requireAdmin, async (req, res) => {
  const db = db_.data;
  const order = db.orders.find((item) => item.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (['deposit_paid', 'paid'].includes(order.payment?.status)) {
    return res.status(409).json({ error: 'The deposit on this order is already recorded.', code: 'already_paid' });
  }

  const provider = text(req.body?.provider, 20) || order.payment?.method || 'mtn_momo';
  if (!['mtn_momo', 'airtel_money'].includes(provider)) {
    return res.status(400).json({ error: 'Choose MTN MoMo or Airtel Money.' });
  }
  const phone = normaliseMsisdn(text(req.body?.payerPhone, 30) || order.payment?.payerPhone || order.client?.phone);
  if (!phone) return res.status(400).json({ error: 'That is not a usable mobile money number.' });

  const due = depositUgxFor(order);
  const result = await requestDeposit({
    provider,
    amountUgx: due,
    payerPhone: phone,
    orderId: order.id,
    depositDueUgx: due,
  });

  if (result.status === 'unconfigured' || result.status === 'failed') {
    return res.status(result.status === 'unconfigured' ? 503 : 502).json({
      status: result.status,
      error: result.error,
      missing: result.missing ?? [],
      manual: {
        merchantNumber: PAYMENT_METHODS.find((method) => method.id === provider)?.accountNumber ?? null,
        reference: order.id,
        amountUgx: due,
      },
    });
  }

  const intent = {
    id: newId('pay'),
    provider,
    status: 'pending',
    referenceId: result.referenceId,
    amountUgx: due,
    amountUsd: depositUsd(order),
    currency: result.currency ?? 'UGX',
    feeUgx: walletFeeUgx(due),
    payer: result.payer,
    payerMasked: result.payerMasked ?? maskMsisdn(result.payer),
    environment: result.environment ?? null,
    requestedAt: result.requestedAt,
    requestedBy: 'console',
    message: result.message,
  };
  order.payment.method = provider;
  order.payment.payerPhone = result.payer;
  order.payment.intents = [intent, ...(order.payment.intents ?? [])].slice(0, 10);
  db_.save();

  res.status(202).json({ intent: intentView(intent), order: decorateOrder(order) });
});

/** Console: re-ask the provider what happened. */
api.post('/api/admin/orders/:id/deposit/:intentId/refresh', requireAdmin, async (req, res) => {
  const db = db_.data;
  const order = db.orders.find((item) => item.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  const intent = (order.payment?.intents ?? []).find((item) => item.id === req.params.intentId);
  if (!intent) return res.status(404).json({ error: 'Payment request not found.' });

  const result = await checkDeposit(intent.provider, intent.referenceId);
  if (result.status === 'unconfigured') {
    return res.status(503).json({ error: unconfiguredPaymentMessage(intent.provider, result.missing), intent: intentView(intent) });
  }
  if (result.error) {
    intent.error = result.error;
    intent.checkedAt = new Date().toISOString();
    db_.save();
  } else {
    await settleIntent(order, intent, result);
  }

  res.json({
    intent: intentView(intent),
    order: decorateOrder(db.orders.find((item) => item.id === order.id) ?? order),
  });
});

/**
 * Sweep every open wallet collection.
 *
 * A webhook can be lost, and a client will not always sit on the page waiting, so
 * the desk asks the provider directly on a schedule. Same reasoning as the alert
 * retry sweep: never rely on one delivery attempt.
 */
api.post('/api/admin/deposits/sweep', requireAdmin, async (_req, res) => {
  const db = db_.data;
  const open = [];
  for (const order of db.orders) {
    for (const intent of order.payment?.intents ?? []) {
      if (intent.status === 'pending') open.push({ order, intent });
    }
  }

  let settled = 0;
  let failed = 0;
  let pending = 0;
  for (const { order, intent } of open.slice(0, 25)) {
    const result = await checkDeposit(intent.provider, intent.referenceId);
    if (result.status === 'unconfigured') break;
    if (result.error) {
      intent.error = result.error;
      intent.checkedAt = new Date().toISOString();
      db_.save();
      continue;
    }
    await settleIntent(order, intent, result);
    if (intent.status === 'successful') settled += 1;
    else if (intent.status === 'failed') failed += 1;
    else pending += 1;
  }

  res.json({ checked: open.length, settled, failed, pending });
});

/**
 * Confirm a deposit the wallet already collected.
 *
 * Deliberately separate from recording a payment: this re-uses the existing
 * confirmation path, so the amount must cover the 50% and the plant release goes
 * through the same gate as a manual confirmation.
 */
api.post('/api/admin/orders/:id/deposit/confirm', requireAdmin, async (req, res) => {
  const db = db_.data;
  const order = db.orders.find((item) => item.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  const intent = (order.payment?.intents ?? []).find(
    (item) => item.status === 'successful' && !item.confirmedDeposit,
  );
  if (!intent) {
    return res.status(409).json({
      error: 'No settled wallet payment is waiting on this order. Request a prompt, or record the deposit by hand.',
      code: 'no_settled_payment',
    });
  }

  const required = depositUsd(order);
  const collectedUsd = Math.round((intent.paidUgx / ugxRate(order)) * 100) / 100;
  if (collectedUsd + 0.005 < required) {
    return res.status(409).json({
      error: `The wallet collected ${collectedUsd.toFixed(2)} USD against a ${required.toFixed(2)} USD deposit — ${(required - collectedUsd).toFixed(2)} USD still short.`,
      code: 'deposit_incomplete',
      shortfallUsd: Math.round((required - collectedUsd) * 100) / 100,
    });
  }

  order.payment.status = 'deposit_paid';
  order.payment.depositPaidUsd = required;
  order.payment.paidAt = intent.settledAt ?? new Date().toISOString();
  order.payment.confirmedAt = new Date().toISOString();
  order.payment.confirmedBy = 'console';
  order.payment.confirmationNote = `${intent.provider} collected UGX ${intent.paidUgx.toLocaleString()}`;
  order.status = order.status === 'received' ? 'confirmed' : order.status;
  intent.confirmedDeposit = true;
  db_.save();

  const release = await autoForwardOrder(order, { trigger: 'deposit' });
  res.json({
    order: decorateOrder(db.orders.find((item) => item.id === order.id) ?? order),
    intent: intentView(intent),
    release: release.skipped ? release : { plant: release.plant.name, delivery: release.delivery },
  });
});

api.post('/api/admin/orders/:id/payment', requireAdmin, async (req, res) => {
  const db = db_.data;
  const order = db.orders.find((item) => item.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  const amount = Number(req.body?.amount);
  const required = Number(order.quote?.deposit ?? 0);
  const paid = Number.isFinite(amount) && amount > 0 ? amount : required;
  const shortfall = Math.round((required - paid) * 100) / 100;

  order.payment.paidAt = new Date().toISOString();
  order.payment.depositPaidUsd = paid;
  order.payment.confirmedAt = order.payment.paidAt;
  order.payment.confirmedBy = 'console';

  // A part-payment is not a deposit. Recording it as one would put the order in
  // the "paid" column and let the plant be contacted on money we don't have.
  if (shortfall > 0.005) {
    order.payment.status = 'processing';
    order.payment.partialUsd = paid;
    order.status = order.status === 'received' ? 'confirmed' : order.status;
    db_.save();
    return res.status(409).json({
      error: `Recorded ${paid.toFixed(2)} USD — still ${shortfall.toFixed(2)} USD short of the ${required.toFixed(2)} deposit. The plant has not been contacted.`,
      code: 'deposit_incomplete',
      order: decorateOrder(order),
      shortfallUsd: shortfall,
    });
  }

  order.payment.status = 'deposit_paid';
  order.status = order.status === 'received' ? 'confirmed' : order.status;
  db_.save();

  // Deposit confirmed → the production request goes to the plant on its own.
  const release = await autoForwardOrder(order, { trigger: 'deposit' });

  res.json({
    order: decorateOrder(db.orders.find((item) => item.id === order.id) ?? order),
    release: release.skipped ? release : { plant: release.plant.name, delivery: release.delivery },
  });
});

api.post('/api/admin/events/:id/retry', requireAdmin, async (req, res) => {
  const event = await retryEvent(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  res.json({ event });
});

api.post('/api/admin/events/test', requireAdmin, async (_req, res) => {
  res.status(201).json({ event: await emitTestEvent() });
});

api.post('/api/admin/reset-demo', requireAdmin, async (_req, res) => {
  await db_.reset();
  res.json({ ok: true });
});

/* ------------------------------ system ------------------------------- */

/**
 * What the console's "System" panel reads: the database driver and whether it
 * survives a deploy, plus every alert channel and the variables it is missing.
 */
api.get('/api/admin/system', requireAdmin, async (_req, res) => {
  const database = await db_.health();
  const outbox = alertOutboxSummary();
  res.json({
    database,
    alerts: {
      channels: notificationChannels(),
      env: alertEnvCheck(),
      verification: channelVerification(),
      outbox,
      automaticRetry: Boolean(process.env.CRON_SECRET),
    },
    payments: {
      rails: paymentsHealth(),
      autoConfirm: String(process.env.MOMO_AUTO_CONFIRM ?? 'false').toLowerCase() === 'true',
      currency: process.env.MOMO_CURRENCY ?? 'UGX',
      walletFeePct: 0.5,
    },
    storage: {
      ...(await storageStats()),
      maxUploadMb: MAX_UPLOAD_MB,
      chunkBytes: CHUNK_BYTES,
    },
    runtime: {
      node: process.version,
      region: process.env.VERCEL_REGION ?? null,
      publicBaseUrl: process.env.PUBLIC_BASE_URL ?? null,
    },
  });
});

/**
 * Telegram's inbound endpoint — the only public route in the app.
 *
 * A webhook cannot carry an admin token, so it authenticates the way Telegram
 * intends: a secret derived from the bot token, sent back in a header that only
 * Telegram and this server can compute. Anything else is ignored with a 200 so a
 * prober learns nothing and Telegram stops retrying.
 *
 * Every message gets one answer: the chat id the desk needs for outbound alerts.
 */
api.post('/api/telegram/webhook', async (req, res) => {
  const secret = req.headers['x-telegram-bot-api-secret-token'];
  const result = await handleTelegramUpdate(req.body ?? {}, secret);
  res.json({ ok: result.ok });
});

/** Replies on or off, and what Telegram says about the endpoint. */
api.get('/api/admin/telegram/webhook', requireAdmin, async (_req, res) => {
  res.json(await telegramWebhookInfo());
});

api.post('/api/admin/telegram/webhook', requireAdmin, async (_req, res) => {
  try {
    const result = await enableTelegramReplies();
    res.json({ ...result, info: await telegramWebhookInfo() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

api.delete('/api/admin/telegram/webhook', requireAdmin, async (_req, res) => {
  try {
    const result = await disableTelegramReplies();
    res.json({ ...result, info: await telegramWebhookInfo() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * "Which chat id am I?" for the Telegram rail.
 *
 * Admin-gated: this calls the Bot API with the configured token, so it must never
 * be public — it returns the chats that have spoken to the bot, never the token.
 */
api.get('/api/admin/telegram/chats', requireAdmin, async (_req, res) => {
  res.json(await telegramDiscoverChats());
});

/** Send a real test on every configured channel and report what came back. */
api.post('/api/admin/alerts/test', requireAdmin, async (req, res) => {
  const requested = Array.isArray(req.body?.channels) ? req.body.channels : null;
  const allowed = ['email', 'telegram', 'whatsapp', 'slack', 'webhook'];
  const channels = requested ? requested.filter((channel) => allowed.includes(channel)) : allowed;
  const results = await sendTestAlerts(channels);

  // Keep a record in the same log as real alerts, so "did anyone test the
  // alerts?" is answerable later.
  for (const result of results) {
    if (result.status === 'unconfigured') continue;
    db_.data.events.unshift(
      stampAlertProof({
        id: newId('evt'),
        orderId: null,
        channel: result.channel,
        mode: result.mode,
        target: result.target ?? 'operations console',
        message: `Manual test alert — ${result.status}`,
        status: result.status,
        attempts: 1,
        httpStatus: result.httpStatus ?? null,
        error: result.error ?? null,
        createdAt: result.attemptedAt,
        lastAttemptAt: result.attemptedAt,
        // Which credentials answered — the console calls a channel "proven" only
        // while this hash matches the environment it is holding today.
        credentials: null,
        payload: { test: true },
      }),
    );
  }
  db_.data.events.length = Math.min(db_.data.events.length, 300);
  db_.save();

  res.status(results.some((result) => result.status === 'delivered') ? 200 : 502).json({ results });
});

/** Re-run every failed alert still under its attempt cap. */
api.post('/api/admin/alerts/retry', requireAdmin, async (_req, res) => {
  const summary = await retryFailedAlerts({ minAgeMs: 0 });
  res.json({ summary, outbox: alertOutboxSummary() });
});

/**
 * The cron safety net.
 *
 * Vercel calls this on the schedule in vercel.json; nothing else can, because it
 * needs CRON_SECRET. With no secret set the route refuses to run rather than
 * leaving an unauthenticated "send all alerts again" button on the internet.
 */
api.get('/api/cron/alerts', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ error: 'CRON_SECRET is not set', code: 'cron_disabled' });
  const header = String(req.headers.authorization ?? '');
  if (header !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorised' });

  const summary = await retryFailedAlerts({ limit: 20 });

  // The daily pass also tidies the two things that otherwise grow forever:
  // abandoned upload chunks, and wallet collections nobody polled.
  const uploads = await reapAbandonedUploads().catch((error) => ({ error: error.message }));
  let deposits = { checked: 0, settled: 0 };
  try {
    const db = db_.data;
    const open = [];
    for (const order of db.orders) {
      for (const intent of order.payment?.intents ?? []) {
        if (intent.status === 'pending') open.push({ order, intent });
      }
    }
    for (const { order, intent } of open.slice(0, 25)) {
      const result = await checkDeposit(intent.provider, intent.referenceId);
      if (result.status === 'unconfigured') break;
      if (!result.error) await settleIntent(order, intent, result);
      deposits.checked += 1;
      if (intent.status === 'successful') deposits.settled += 1;
    }
  } catch (error) {
    deposits = { checked: 0, settled: 0, error: error.message };
  }

  res.json({ ok: true, at: new Date().toISOString(), summary, uploads, deposits });
});

/* ---------------------------- shop console ---------------------------- */

api.get('/api/admin/shop', requireAdmin, (_req, res) => {
  res.json(adminShopOverview());
});

api.patch('/api/admin/shop/orders/:id', requireAdmin, (req, res) => {
  const result = updateShopOrder(req.params.id, req.body ?? {});
  res.status(result.status).json(result.body);
});

api.patch('/api/admin/shop/stock/:releaseId', requireAdmin, (req, res) => {
  const result = setReleaseStock(req.params.releaseId, req.body?.stock);
  res.status(result.status).json(result.body);
});

api.get('/api/admin/orders/:id/invoice', requireAdmin, (req, res) => {
  const db = db_.data;
  const order = db.orders.find((item) => item.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  const before = order.invoice?.number;
  const invoice = ensureInvoice(order, db);
  if (!before) db_.save();
  res.setHeader('Cache-Control', 'no-store');
  res.type('text/html').send(renderInvoiceHtml(order, invoice));
});

api.get('/api/admin/orders/:id/payload', requireAdmin, (req, res) => {
  const order = db_.data.orders.find((item) => item.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  res.type('text/plain').send(plantPayloadText(order));
});

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

// Unknown API routes answer with JSON (never the SPA shell), so a mistyped
// endpoint can't be mistaken for a successful HTML response.
api.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found.' });
});

export function apiErrorHandler(err, _req, res, _next) {
  if (res.headersSent) return;
  console.error('[7h] Unhandled error:', err?.message ?? err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
}

export default api;
