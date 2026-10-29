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
import { alertEnvCheck, notificationConfig, sendTestAlerts } from './notifications.js';
import { db_, ensureDirs, newOrderId, newId, refreshStore, storeReady, UPLOAD_DIR } from './store.js';
import {
  alertOutboxSummary,
  automationConfig,
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
    alerts: {
      channels: alertEnvCheck().map((entry) => ({ channel: entry.channel, ready: entry.ready, missing: entry.missing })),
    },
  });
});

/* ------------------------------------------------------------------ *
 * Uploads
 * ------------------------------------------------------------------ */

ensureDirs();

const AUDIO_EXT = new Set(['.wav', '.mp3', '.aif', '.aiff', '.flac', '.m4a', '.aac']);
const ART_EXT = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.tif', '.tiff']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path
      .basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-z0-9-_]+/gi, '-')
      .slice(0, 48)
      .toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${base || 'file'}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const field = file.fieldname;
    if (field === 'audio' && AUDIO_EXT.has(ext)) return cb(null, true);
    if (field === 'artwork' && ART_EXT.has(ext)) return cb(null, true);
    const expected = field === 'artwork' ? 'PDF, JPG, PNG or TIFF' : 'WAV, AIFF, FLAC or MP3';
    return cb(new Error(`Unsupported file type "${ext || file.originalname}". ${field === 'artwork' ? 'Artwork' : 'Audio'} must be ${expected}.`));
  },
});

const fileKind = (field) => (field === 'artwork' ? 'artwork' : 'audio');

api.post('/api/uploads', (req, res) => {
  upload.fields([
    { name: 'audio', maxCount: 4 },
    { name: 'artwork', maxCount: 4 },
  ])(req, res, (error) => {
    if (error) {
      const message =
        error.code === 'LIMIT_FILE_SIZE'
          ? `That file is over the ${MAX_UPLOAD_MB}MB limit. Share a WeTransfer or Dropbox link instead.`
          : error.message;
      return res.status(400).json({ error: message });
    }

    const files = req.files ?? {};
    const records = [];

    for (const field of ['audio', 'artwork']) {
      for (const file of files[field] ?? []) {
        const id = newId('upl');
        const record = {
          id,
          originalName: file.originalname,
          storedName: file.filename,
          mimeType: file.mimetype,
          size: file.size,
          kind: fileKind(field),
          createdAt: new Date().toISOString(),
          url: `/api/files/${id}/download`,
        };
        db_.data.uploads.unshift(record);
        records.push(record);
      }
    }

    if (db_.data.uploads.length > 500) db_.data.uploads.length = 500;
    db_.save();

    res.status(201).json({ uploads: records });
  });
});

api.get('/api/files/:id/download', (req, res) => {
  const db = db_.data;
  const record =
    db.uploads.find((item) => item.id === req.params.id) ??
    db.uploads.find((item) => item.storedName === req.params.id);

  if (!record) return res.status(404).json({ error: 'File not found.' });

  const filePath = path.join(UPLOAD_DIR, record.storedName);
  if (!fs.existsSync(filePath)) {
    // Demo records are metadata-only; hand back a signed placeholder so the admin
    // console still demonstrates the hand-off workflow.
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(
      `7H MUSIC GROUP — DEMO FILE PLACEHOLDER\n\nFile: ${record.originalName}\nKind: ${record.kind}\nBytes: ${record.size}\n\nThis is seeded demo metadata; real client uploads are streamed from storage.\n`,
    );
  }

  res.setHeader('Content-Disposition', `attachment; filename="${record.originalName.replace(/"/g, '')}"`);
  return res.sendFile(filePath);
});

/* ------------------------------------------------------------------ *
 * Public config + quoting
 * ------------------------------------------------------------------ */

api.get('/api/config', (_req, res) => {
  res.json({
    company: COMPANY,
    fxRate: FX_UGX_PER_USD,
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
      maxFiles: 6,
      audio: ['.wav', '.aif', '.aiff', '.flac', '.mp3', '.m4a', '.aac'],
      artwork: ['.pdf', '.jpg', '.jpeg', '.png', '.tif', '.tiff'],
    },
  });
});

api.post('/api/quote', (req, res) => {
  const { quantity, vinylTypeId, sleeveId, plantId } = req.body ?? {};
  const quote = calculateQuote({
    quantity,
    vinylTypeId,
    sleeveId,
    plantId,
    fxRate: FX_UGX_PER_USD,
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
    fxRate: FX_UGX_PER_USD,
  });
  if (!quote.valid) return res.status(400).json({ error: quote.errors[0] });

  const errors = {};
  const name = text(client.name, 120);
  const email = text(client.email, 160);
  const phone = text(client.phone, 30).replace(/\s+/g, ' ');
  const deliveryType = client.deliveryType === 'international' ? 'international' : 'uganda';
  const deliveryAddress = text(client.deliveryAddress, 300);
  const deliveryCity = text(client.deliveryCity, 120);
  const country = text(client.country, 80) || (deliveryType === 'uganda' ? 'Uganda' : '');
  const notes = text(client.notes, 1200);

  if (name.length < 2) errors.name = 'Enter the artist or label name.';
  if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid contact email.';
  if (!PHONE_RE.test(phone)) errors.phone = 'Enter a WhatsApp number with country code.';
  if (deliveryAddress.length < 6) errors.deliveryAddress = 'Add the full delivery address.';
  if (deliveryCity.length < 2) errors.deliveryCity = 'Add the city.';
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
      deliveryAddress,
      deliveryCity,
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

api.get('/api/shop', (_req, res) => {
  res.json(shopConfig());
});

api.post('/api/shop/orders', async (req, res) => {
  const ip = req.ip ?? 'unknown';
  if (shopRateLimited(ip)) {
    return res.status(429).json({ error: 'That is a lot of orders — give it a minute and try again.' });
  }

  const result = await placeShopOrder({
    ...(req.body ?? {}),
    userAgent: req.headers['user-agent'],
  });
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

api.patch('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const db = db_.data;
  const order = db.orders.find((item) => item.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  const { status, paymentStatus } = req.body ?? {};
  if (status && !ORDER_STATUSES.has(status)) return res.status(400).json({ error: 'Unknown status.' });
  if (paymentStatus && !['awaiting_deposit', 'processing', 'deposit_paid', 'paid'].includes(paymentStatus)) {
    return res.status(400).json({ error: 'Unknown payment status.' });
  }

  if (status) {
    order.status = status;
    order.statusHistory = [
      ...(order.statusHistory ?? []),
      { status, at: new Date().toISOString(), by: 'management', note: 'Manual update from console' },
    ];
  }
  if (paymentStatus) order.payment.status = paymentStatus;
  db_.save();
  res.json({ order: decorateOrder(order) });
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

api.post('/api/admin/orders/:id/payment', requireAdmin, async (req, res) => {
  const db = db_.data;
  const order = db.orders.find((item) => item.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  const amount = req.body?.amount;
  order.payment.status = 'deposit_paid';
  order.payment.paidAt = new Date().toISOString();
  order.payment.depositPaidUsd = Number(amount) > 0 ? Number(amount) : order.quote.deposit;
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
      outbox,
      automaticRetry: Boolean(process.env.CRON_SECRET),
    },
    runtime: {
      node: process.version,
      region: process.env.VERCEL_REGION ?? null,
      publicBaseUrl: process.env.PUBLIC_BASE_URL ?? null,
    },
  });
});

/** Send a real test on every configured channel and report what came back. */
api.post('/api/admin/alerts/test', requireAdmin, async (req, res) => {
  const requested = Array.isArray(req.body?.channels) ? req.body.channels : null;
  const allowed = ['email', 'whatsapp', 'slack', 'webhook'];
  const channels = requested ? requested.filter((channel) => allowed.includes(channel)) : allowed;
  const results = await sendTestAlerts(channels);

  // Keep a record in the same log as real alerts, so "did anyone test the
  // alerts?" is answerable later.
  for (const result of results) {
    if (result.status === 'unconfigured') continue;
    db_.data.events.unshift({
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
      payload: { test: true },
    });
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
  res.json({ ok: true, at: new Date().toISOString(), summary });
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
