/**
 * Database checks.
 *
 * The Postgres driver is exercised against PGlite — the real PostgreSQL engine
 * compiled to WebAssembly — so the SQL that ships is the SQL that was run: the
 * same DDL, the same `on conflict` upserts, the same conditional stock update.
 *
 * The Redis driver is exercised against a small in-memory stand-in for the
 * Upstash REST API, including the negative-decrement rollback.
 *
 * Run with `npm run test:db`.
 */
import http from 'node:http';
import { PGlite } from '@electric-sql/pglite';

import { postgresDriver, POSTGRES_SCHEMA } from '../server/db/postgres.js';
import { redisDriver } from '../server/db/redis.js';
import { fileDriver } from '../server/db/file.js';
import { createDriver, describeDrivers } from '../server/db/index.js';
import { emptyDoc, normalizeDoc, seedStock, sliceDiff, stockDiff } from '../server/db/document.js';

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function sampleDoc(overrides = {}) {
  const now = new Date().toISOString();
  return normalizeDoc({
    ...emptyDoc(),
    orders: [
      {
        id: '7H-2026-TEST',
        createdAt: now,
        status: 'received',
        client: { name: 'Test Artist', email: 'artist@test.dev', phone: '+256700000000' },
        quote: { total: 1200, deposit: 600 },
        payment: { status: 'awaiting_deposit', method: 'mtn_momo' },
      },
    ],
    uploads: [{ id: 'upl_test', orderId: '7H-2026-TEST', kind: 'audio', originalName: 'master.wav' }],
    events: [
      { id: 'evt_test', orderId: '7H-2026-TEST', channel: 'email', status: 'delivered', attempts: 1 },
    ],
    shop: {
      stock: seedStock(),
      orders: [
        {
          id: '7H-SHOP-TEST01',
          createdAt: now,
          status: 'placed',
          total: 55,
          buyer: { name: 'Fan', email: 'fan@test.dev', phone: '+256700000001' },
          payment: { status: 'pending', method: 'mtn_momo' },
          items: [{ releaseId: 'pearl-of-africa', quantity: 1 }],
        },
      ],
    },
    ...overrides,
  });
}

/* ------------------------------------------------------------------ *
 * Diffing
 * ------------------------------------------------------------------ */

function testDiffs() {
  console.log('\n▸ Only what changed is written');
  const before = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'c', v: 3 }];
  const after = [{ id: 'a', v: 1 }, { id: 'b', v: 9 }, { id: 'd', v: 4 }];
  const diff = sliceDiff(before, after);
  check('unchanged rows are skipped', diff.changed.length === 2, `changed ${diff.changed.length}`);
  check('updated row is included', diff.changed.some((row) => row.id === 'b'));
  check('new row is included', diff.changed.some((row) => row.id === 'd'));
  check('removed rows are collected', equal(diff.removed, ['c']));

  const stock = stockDiff({ a: 1, b: 2 }, { a: 1, b: 0 });
  check('stock diff only reports moved counters', equal(stock, [['b', 0]]), JSON.stringify(stock));
}

/* ------------------------------------------------------------------ *
 * PostgreSQL (PGlite)
 * ------------------------------------------------------------------ */

async function testPostgres() {
  console.log('\n▸ PostgreSQL driver');
  const pg = new PGlite();
  const driver = postgresDriver({ client: pg });

  await driver.init();
  const tables = await pg.query(
    `select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
  );
  const names = tables.rows.map((row) => row.table_name);
  for (const table of ['pressing_orders', 'shop_orders', 'uploads', 'alert_events', 'shop_stock', 'store_meta']) {
    check(`schema creates ${table}`, names.includes(table));
  }

  const doc = sampleDoc();
  await driver.save(null, doc);

  const loaded = await driver.load();
  check('orders round-trip', loaded.orders[0]?.id === '7H-2026-TEST');
  check('uploads round-trip', loaded.uploads[0]?.id === 'upl_test');
  check('events round-trip', loaded.events[0]?.id === 'evt_test');
  check('shop orders round-trip', loaded.shop.orders[0]?.id === '7H-SHOP-TEST01');
  check('stock round-trips', loaded.shop.stock.badman === 35, String(loaded.shop.stock.badman));

  // Change one order, save, and confirm only that row moved.
  const before = new Date(Date.now() - 60_000).toISOString();
  await pg.query(`update pressing_orders set updated_at = $1`, [before]);
  const shopRowBefore = await pg.query(`select updated_at from shop_orders where id = '7H-SHOP-TEST01'`);
  const next = structuredClone(loaded);
  next.orders[0].status = 'forwarded';
  await driver.save(loaded, next);

  const row = await pg.query(`select status, updated_at from pressing_orders where id = '7H-2026-TEST'`);
  check('status column follows the document', row.rows[0].status === 'forwarded', row.rows[0].status);
  const untouched = await pg.query(`select updated_at from shop_orders where id = '7H-SHOP-TEST01'`);
  check(
    'a save touches only the rows that changed',
    new Date(untouched.rows[0].updated_at).toISOString() ===
      new Date(shopRowBefore.rows[0].updated_at).toISOString(),
    `${shopRowBefore.rows[0].updated_at} → ${untouched.rows[0].updated_at}`,
  );

  // A deleted row really goes.
  const trimmed = structuredClone(next);
  trimmed.events = [];
  await driver.save(next, trimmed);
  const events = await pg.query('select count(*)::int as n from alert_events');
  check('removed rows are deleted', events.rows[0].n === 0, String(events.rows[0].n));

  // Atomic stock.
  const ok = await driver.reserve([{ releaseId: 'pearl-of-africa', quantity: 3 }]);
  check('reserve succeeds within stock', ok.ok && ok.stock['pearl-of-africa'] === 57, JSON.stringify(ok.stock));
  const refused = await driver.reserve([{ releaseId: 'badman', quantity: 999 }]);
  check('reserve refuses to oversell', refused.ok === false && refused.available === 35, JSON.stringify(refused));

  // Two fans, one copy: exactly one order may take it.
  await pg.query(`update shop_stock set stock = 1 where release_id = 'with-the-gs'`);
  const [first, second] = await Promise.all([
    driver.reserve([{ releaseId: 'with-the-gs', quantity: 1 }]),
    driver.reserve([{ releaseId: 'with-the-gs', quantity: 1 }]),
  ]);
  check(
    'concurrent buyers cannot both take the last copy',
    [first.ok, second.ok].filter(Boolean).length === 1,
    `first=${first.ok} second=${second.ok}`,
  );

  // Multi-line reservation is all-or-nothing.
  await pg.query(`update shop_stock set stock = 2 where release_id in ('badman','proof-of-life')`);
  const partial = await driver.reserve([
    { releaseId: 'badman', quantity: 1 },
    { releaseId: 'proof-of-life', quantity: 5 },
  ]);
  const after = await pg.query(
    `select release_id, stock from shop_stock where release_id in ('badman','proof-of-life') order by release_id`,
  );
  check('a refused basket restores every counter', partial.ok === false && after.rows.every((r) => r.stock === 2), JSON.stringify(after.rows));

  await driver.setStock('badman', 12);
  const stockNow = await driver.refreshStock();
  check('console restock is persisted', stockNow.badman === 12, String(stockNow.badman));

  const health = await driver.health();
  check('health reports ok', health.ok === true);
  check('health counts the orders', health.counts.orders === 1, JSON.stringify(health.counts));

  // Restart: a new driver over the same database sees the same data.
  const restarted = postgresDriver({ client: pg });
  const reloaded = await restarted.load();
  check('data survives a restart', reloaded.orders[0]?.status === 'forwarded');
  check('stock survives a restart', reloaded.shop.stock.badman === 12);

  await driver.reset(sampleDoc());
  const cleared = await pg.query('select count(*)::int as n from pressing_orders');
  check('reset empties the tables', cleared.rows[0].n === 0, String(cleared.rows[0].n));

  await pg.close();
}

/* ------------------------------------------------------------------ *
 * Redis (a small stand-in for the Upstash REST API)
 * ------------------------------------------------------------------ */

function fakeUpstash() {
  const strings = new Map();
  const hashes = new Map();
  const hash = (key) => {
    if (!hashes.has(key)) hashes.set(key, new Map());
    return hashes.get(key);
  };

  const run = ([command, ...args]) => {
    const name = String(command).toUpperCase();
    switch (name) {
      case 'GET':
        return strings.get(args[0]) ?? null;
      case 'SET':
        strings.set(args[0], args[1]);
        return 'OK';
      case 'DEL': {
        let removed = 0;
        for (const key of args) {
          if (strings.delete(key) || hashes.delete(key)) removed += 1;
        }
        return removed;
      }
      case 'HGET':
        return hash(args[0]).get(args[1]) ?? null;
      case 'HSET': {
        const target = hash(args[0]);
        let added = 0;
        for (let index = 1; index < args.length; index += 2) {
          if (!target.has(args[index])) added += 1;
          target.set(args[index], String(args[index + 1]));
        }
        return added;
      }
      case 'HGETALL': {
        const out = [];
        for (const [field, value] of hash(args[0])) out.push(field, value);
        return out;
      }
      case 'HINCRBY': {
        const target = hash(args[0]);
        const value = Number(target.get(args[1]) ?? 0) + Number(args[2]);
        target.set(args[1], String(value));
        return value;
      }
      case 'STRLEN':
        return (strings.get(args[0]) ?? '').length;
      case 'PING':
        return 'PONG';
      default:
        throw new Error(`unsupported command ${name}`);
    }
  };

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : [];
        const isPipeline = req.url?.includes('pipeline');
        const result = isPipeline
          ? parsed.map((command) => ({ result: run(command) }))
          : { result: run(parsed) };
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: error.message }));
      }
    });
  });

  return {
    server,
    listen: () =>
      new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
      }),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function testRedis() {
  console.log('\n▸ Redis driver (Upstash REST stand-in)');
  const fake = fakeUpstash();
  const url = await fake.listen();
  const driver = redisDriver({ url, token: 'test-token' });

  await driver.init();
  const seeded = await driver.refreshStock();
  check('stock hash is seeded on first boot', seeded['pearl-of-africa'] === 60, String(seeded['pearl-of-africa']));

  const empty = await driver.load();
  check('an untouched store loads as null (so the app seeds it)', empty === null);

  const doc = sampleDoc();
  await driver.save(null, doc);
  const loaded = await driver.load();
  check('orders round-trip', loaded.orders[0]?.id === '7H-2026-TEST');
  check('shop orders round-trip', loaded.shop.orders[0]?.id === '7H-SHOP-TEST01');
  check('stock round-trips', loaded.shop.stock.badman === 35, String(loaded.shop.stock.badman));

  const next = structuredClone(loaded);
  next.orders[0].status = 'forwarded';
  await driver.save(loaded, next);
  const reloaded = await driver.load();
  check('an edit is written through', reloaded.orders[0]?.status === 'forwarded');

  const ok = await driver.reserve([{ releaseId: 'badman', quantity: 5 }]);
  check('reserve decrements the hash', ok.ok && ok.stock.badman === 30, JSON.stringify(ok.stock));

  const refused = await driver.reserve([
    { releaseId: 'pearl-of-africa', quantity: 1 },
    { releaseId: 'with-the-gs', quantity: 999 },
  ]);
  const stockAfter = await driver.refreshStock();
  check('a refused basket restores the earlier line', refused.ok === false, JSON.stringify(refused));
  check('…and leaves the hash untouched', stockAfter['pearl-of-africa'] === 60, String(stockAfter['pearl-of-africa']));

  await driver.setStock('badman', 4);
  check('console restock is persisted', (await driver.refreshStock()).badman === 4);

  const health = await driver.health();
  check('health reports ok', health.ok === true, health.error);

  await driver.reset(sampleDoc());
  const cleared = await driver.load();
  check('reset clears orders', (cleared?.orders?.length ?? 0) === 0, String(cleared?.orders?.length));

  await driver.close();
  await fake.close();
}

/* ------------------------------------------------------------------ *
 * File driver + selection
 * ------------------------------------------------------------------ */

async function testFileAndSelection() {
  console.log('\n▸ File driver and driver selection');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '7h-db-'));
  const driver = fileDriver({ file: path.join(dir, 'db.json'), dataDir: dir });

  await driver.init();
  check('an empty data dir loads as null', (await driver.load()) === null);
  await driver.save(null, sampleDoc());
  const loaded = await driver.load();
  check('a file store round-trips', loaded.orders[0]?.id === '7H-2026-TEST');
  check('a file store is reported as not persistent', (await driver.health()).persistent === false);

  const postgresChoice = createDriver({ env: { DATABASE_URL: 'postgres://user:pw@host/db' } });
  check('DATABASE_URL selects Postgres', postgresChoice.name === 'postgres');
  const neonChoice = createDriver({ env: { POSTGRES_URL: 'postgres://user:pw@host/db' }, file: 'x' });
  check('the Vercel Neon integration’s POSTGRES_URL also selects Postgres', neonChoice.name === 'postgres');
  const redisChoice = createDriver({ env: { KV_REST_API_URL: 'https://x', KV_REST_API_TOKEN: 't' }, file: 'x' });
  check('Vercel KV variables select Redis', redisChoice.name === 'redis');
  const fallback = createDriver({ env: {}, file: path.join(dir, 'db.json'), dataDir: dir });
  check('no database configured falls back to a file', fallback.name === 'file');

  const described = describeDrivers({ DATABASE_URL: 'postgres://x' });
  check('describeDrivers advertises what is configured', described.postgres.configured === true);
  check('the schema is exported for migrations', POSTGRES_SCHEMA.includes('create table if not exists shop_stock'));

  fs.rmSync(dir, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ */

try {
  testDiffs();
  await testPostgres();
  await testRedis();
  await testFileAndSelection();
} catch (error) {
  console.error('\nSuite crashed:', error);
  failures.push(`suite crashed: ${error.message}`);
}

console.log('');
if (failures.length > 0) {
  console.error(`${passed}/${passed + failures.length} checks passed`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`${passed}/${passed} checks passed`);
