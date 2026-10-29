/**
 * Upstash Redis / Vercel KV driver.
 *
 * For teams who would rather not run Postgres. It speaks the REST API over
 * fetch, so there is no client library to bundle: every Vercel KV store now
 * hands out `KV_REST_API_URL` + `KV_REST_API_TOKEN`, and Upstash's own free tier
 * hands out the same pair under `UPSTASH_*` names.
 *
 * Layout:
 *   7h:orders        JSON array   pressing orders
 *   7h:shop:orders   JSON array   fan orders
 *   7h:uploads       JSON array   master / artwork files
 *   7h:alerts        JSON array   alert log (the outbox)
 *   7h:stock         hash         release id → units on the shelf
 *
 * Stock is a hash rather than a number inside a JSON blob so a sale can be a
 * single atomic `DECRBY` instead of a read-modify-write race. If the decrement
 * takes the counter negative we put it back and report the real count — the same
 * promise the Postgres driver makes with a conditional UPDATE.
 */
import { SHOP_RELEASES } from '../../shared/shop.js';
import { emptyDoc, normalizeDoc, seedStock, sliceDiff } from './document.js';

const KEYS = {
  orders: '7h:orders',
  uploads: '7h:uploads',
  alerts: '7h:alerts',
  shopOrders: '7h:shop:orders',
  stock: '7h:stock',
  meta: '7h:meta',
};

export function redisDriver({ url, token, fetchImpl = fetch } = {}) {
  let ready = null;

  async function command(...args) {
    if (!url || !token) throw new Error('Redis URL / token are not set');
    const response = await fetchImpl(`${String(url).replace(/\/$/, '')}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(args),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Redis HTTP ${response.status} — ${text.slice(0, 160)}`);
    const parsed = text ? JSON.parse(text) : {};
    if (parsed.error) throw new Error(`Redis — ${parsed.error}`);
    return parsed.result;
  }

  async function pipeline(commands) {
    if (commands.length === 0) return [];
    const response = await fetchImpl(`${String(url).replace(/\/$/, '')}/pipeline`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(commands),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Redis HTTP ${response.status} — ${text.slice(0, 160)}`);
    const parsed = text ? JSON.parse(text) : [];
    for (const entry of Array.isArray(parsed) ? parsed : [parsed]) {
      if (entry?.error) throw new Error(`Redis — ${entry.error}`);
    }
    return parsed;
  }

  const parse = (value, fallback) => {
    if (!value) return fallback;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  };

  return {
    name: 'redis',
    label: 'Upstash Redis / Vercel KV',
    persistent: true,

    async init() {
      if (ready) return ready;
      ready = (async () => {
        const existing = await command('HGETALL', KEYS.stock);
        const pairs = Array.isArray(existing) ? existing : [];
        const present = new Set();
        for (let index = 0; index < pairs.length; index += 2) present.add(pairs[index]);
        const missing = SHOP_RELEASES.filter((release) => !present.has(release.id));
        if (missing.length > 0) {
          await pipeline(
            missing.map((release) => ['HSET', KEYS.stock, release.id, release.stock]),
          );
        }
        return true;
      })();
      return ready;
    },

    async load() {
      await this.init();
      const [ordersRaw, shopRaw, uploadsRaw, alertsRaw, stockRaw, metaRaw] = await pipeline([
        ['GET', KEYS.orders],
        ['GET', KEYS.shopOrders],
        ['GET', KEYS.uploads],
        ['GET', KEYS.alerts],
        ['HGETALL', KEYS.stock],
        ['GET', KEYS.meta],
      ]);

      const meta = parse(metaRaw?.result ?? metaRaw, null);
      const hasData =
        [ordersRaw, shopRaw, uploadsRaw, alertsRaw].some(
          (entry) => entry?.result != null && entry.result !== '',
        ) || Boolean(meta);
      if (!hasData) return null;

      const pairs = Array.isArray(stockRaw?.result) ? stockRaw.result : [];
      const stock = {};
      for (let index = 0; index < pairs.length; index += 2) stock[pairs[index]] = Number(pairs[index + 1]);

      return normalizeDoc({
        ...emptyDoc(),
        createdAt: meta?.createdAt ?? new Date().toISOString(),
        orders: parse(ordersRaw?.result ?? ordersRaw, []),
        uploads: parse(uploadsRaw?.result ?? uploadsRaw, []),
        events: parse(alertsRaw?.result ?? alertsRaw, []),
        shop: { stock, orders: parse(shopRaw?.result ?? shopRaw, []) },
      });
    },

    async save(prev, next) {
      await this.init();
      const sliceOf = (doc, name) => (name === 'shopOrders' ? doc?.shop?.orders ?? [] : doc?.[name] ?? []);
      const writes = [];

      for (const [slice, key] of [
        ['orders', KEYS.orders],
        ['shopOrders', KEYS.shopOrders],
        ['uploads', KEYS.uploads],
        ['events', KEYS.alerts],
      ]) {
        const diff = sliceDiff(sliceOf(prev, slice), sliceOf(next, slice));
        if (diff.changed.length === 0 && diff.removed.length === 0) continue;
        writes.push(['SET', key, JSON.stringify(sliceOf(next, slice))]);
      }

      const previousStock = prev?.shop?.stock ?? {};
      const changes = Object.entries(next?.shop?.stock ?? {}).filter(
        ([releaseId, value]) => previousStock[releaseId] !== value,
      );
      if (changes.length > 0) {
        writes.push(['HSET', KEYS.stock, ...changes.flatMap(([releaseId, value]) => [releaseId, value])]);
      }

      writes.push([
        'SET',
        KEYS.meta,
        JSON.stringify({ createdAt: next.createdAt, version: next.version, updatedAt: new Date().toISOString() }),
      ]);

      await pipeline(writes);
    },

    async reserve(lines) {
      await this.init();
      const taken = [];
      for (const line of lines) {
        const left = await command('HINCRBY', KEYS.stock, line.releaseId, -line.quantity);
        if (Number(left) < 0) {
          // Someone else got the last copy — undo everything this order took.
          await command('HINCRBY', KEYS.stock, line.releaseId, line.quantity);
          for (const [releaseId, quantity] of taken) {
            await command('HINCRBY', KEYS.stock, releaseId, quantity);
          }
          const now = await command('HGET', KEYS.stock, line.releaseId);
          return { ok: false, releaseId: line.releaseId, available: Math.max(0, Number(now ?? 0)) };
        }
        taken.push([line.releaseId, line.quantity]);
      }

      const stock = {};
      for (const line of lines) {
        stock[line.releaseId] = Number((await command('HGET', KEYS.stock, line.releaseId)) ?? 0);
      }
      return { ok: true, stock };
    },

    async setStock(releaseId, value) {
      await this.init();
      await command('HSET', KEYS.stock, releaseId, value);
      return value;
    },

    async refreshStock() {
      await this.init();
      const pairs = await command('HGETALL', KEYS.stock);
      const stock = {};
      for (let index = 0; index < (pairs?.length ?? 0); index += 2) {
        stock[pairs[index]] = Number(pairs[index + 1]);
      }
      return stock;
    },

    async reset(doc) {
      await this.init();
      await command('DEL', KEYS.orders, KEYS.shopOrders, KEYS.uploads, KEYS.alerts, KEYS.meta);
      await command('DEL', KEYS.stock);
      const stock = doc.shop?.stock ?? seedStock();
      await pipeline(Object.entries(stock).map(([releaseId, value]) => ['HSET', KEYS.stock, releaseId, value]));
    },

    async health() {
      const started = Date.now();
      try {
        const [orders, shopOrders] = await pipeline([
          ['STRLEN', KEYS.orders],
          ['STRLEN', KEYS.shopOrders],
        ]);
        await command('PING');
        return {
          ok: true,
          driver: 'redis',
          label: 'Upstash Redis / Vercel KV',
          persistent: true,
          latencyMs: Date.now() - started,
          counts: { orderBytes: Number(orders?.result ?? 0), shopOrderBytes: Number(shopOrders?.result ?? 0) },
        };
      } catch (error) {
        return { ok: false, driver: 'redis', label: 'Upstash Redis / Vercel KV', persistent: true, error: error.message };
      }
    },

    async close() {
      ready = null;
    },
  };
}

export const REDIS_KEYS = KEYS;
