/**
 * PostgreSQL driver — the real database.
 *
 * Works with anything that speaks the Postgres wire protocol and hands you a
 * URL: Neon, Supabase, Vercel Postgres, RDS, or a box you run yourself. Point
 * `DATABASE_URL` at it and every order, alert and stock count survives a cold
 * start, a redeploy and a rollback.
 *
 * Rows are stored as `id` + `data jsonb` rather than a table per field: the
 * order object is the unit of work everywhere else in this codebase (the
 * console, the plant email, the buyer's receipt all read it whole), so the
 * columns that matter for querying — id, timestamps, price, status — are real
 * columns while the rest of the record rides along in `data`.
 *
 * Stock is the one thing that cannot be last-write-wins: two fans tapping "Buy"
 * on the last copy must not both succeed. It lives in its own table and is
 * decremented with a single conditional UPDATE inside a transaction.
 */
import { SHOP_RELEASES } from '../../shared/shop.js';
import { emptyDoc, normalizeDoc, seedStock, sliceDiff, stockDiff } from './document.js';

const SCHEMA = `
create table if not exists pressing_orders (
  id          text primary key,
  status      text,
  price_usd   numeric(12,2),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  data        jsonb not null
);

create table if not exists shop_orders (
  id          text primary key,
  status      text,
  payment_status text,
  total_usd   numeric(12,2),
  buyer_email text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  data        jsonb not null
);

create table if not exists uploads (
  id          text primary key,
  order_id    text,
  kind        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  data        jsonb not null
);

create table if not exists alert_events (
  id          text primary key,
  order_id    text,
  channel     text,
  status      text,
  attempts    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  data        jsonb not null
);

create index if not exists alert_events_status_idx on alert_events (status, channel);
create index if not exists alert_events_order_idx on alert_events (order_id);

create table if not exists shop_stock (
  release_id  text primary key,
  stock       integer not null check (stock >= 0),
  updated_at  timestamptz not null default now()
);

create table if not exists store_meta (
  key    text primary key,
  value  jsonb not null
);
`;

/** Run the DDL one statement at a time — portable across pools and PGlite. */
const SCHEMA_STATEMENTS = SCHEMA.split(';')
  .map((statement) => statement.trim())
  .filter(Boolean);

const TABLES = [
  { slice: 'orders', table: 'pressing_orders', columns: (order) => [order.status ?? null, order.quote?.total ?? null] },
  { slice: 'uploads', table: 'uploads', columns: (file) => [file.orderId ?? null, file.kind ?? null] },
  { slice: 'events', table: 'alert_events', columns: (event) => [event.orderId ?? null, event.channel ?? null, event.status ?? null, event.attempts ?? 0] },
  { slice: 'shopOrders', table: 'shop_orders', columns: (order) => [order.status ?? null, order.payment?.status ?? null, order.total ?? null, order.buyer?.email ?? null] },
];

const COLUMN_NAMES = {
  pressing_orders: ['status', 'price_usd'],
  uploads: ['order_id', 'kind'],
  alert_events: ['order_id', 'channel', 'status', 'attempts'],
  shop_orders: ['status', 'payment_status', 'total_usd', 'buyer_email'],
};

/**
 * @param {object} options
 * @param {string} [options.url] `postgres://…` connection string
 * @param {{query: Function}} [options.client] an already-connected client (tests)
 */
export function postgresDriver({ url, client: injectedClient } = {}) {
  let pool = null;
  let client = injectedClient ?? null;
  let ownsPool = false;
  let ready = null;

  async function connect() {
    if (client) return client;
    if (!url) throw new Error('DATABASE_URL is not set');
    const { default: pg } = await import('pg');
    const needsSsl = /sslmode=require|neon\.tech|supabase\.co|render\.com|amazonaws\.com/i.test(url);
    pool = new pg.Pool({
      connectionString: url,
      max: Number(process.env.PG_POOL_MAX ?? 3),
      connectionTimeoutMillis: 8000,
      idleTimeoutMillis: 10_000,
      ...(needsSsl && !/sslmode=disable/i.test(url) ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    // A pooled client that errors after the response was sent must not crash the
    // function — log it and let the next request reconnect.
    pool.on('error', (error) => console.warn('[db:postgres] idle client error', error.message));
    ownsPool = true;
    client = pool;
    return client;
  }

  const q = async (sql, params) => (await connect()).query(sql, params);

  /** Run `fn` inside a transaction, rolling back on any throw. */
  async function withTransaction(fn) {
    const connection = await connect();
    const needsDedicated = typeof connection.connect === 'function';
    const runner = needsDedicated ? await connection.connect() : connection;
    try {
      await runner.query('begin');
      const result = await fn((sql, params) => runner.query(sql, params));
      await runner.query('commit');
      return result;
    } catch (error) {
      try {
        await runner.query('rollback');
      } catch {
        /* the connection is already gone; the transaction died with it */
      }
      throw error;
    } finally {
      runner.release?.();
    }
  }

  async function ensureStockRows() {
    const values = SHOP_RELEASES.map((release) => release.stock);
    const placeholders = SHOP_RELEASES.map((_, index) => `($${index * 2 + 1}, $${index * 2 + 2})`).join(',');
    const params = SHOP_RELEASES.flatMap((release, index) => [release.id, values[index]]);
    await q(
      `insert into shop_stock (release_id, stock) values ${placeholders}
       on conflict (release_id) do nothing`,
      params,
    );
  }

  return {
    name: 'postgres',
    label: 'PostgreSQL',
    persistent: true,

    async init() {
      if (ready) return ready;
      ready = (async () => {
        await connect();
        for (const statement of SCHEMA_STATEMENTS) await q(statement);
        await ensureStockRows();
        return true;
      })();
      return ready;
    },

    async load() {
      await this.init();
      const [orders, shopOrders, uploads, events, stock, meta] = await Promise.all([
        q('select data from pressing_orders order by created_at desc'),
        q('select data from shop_orders order by created_at desc'),
        q('select data from uploads order by created_at desc'),
        q('select data from alert_events order by created_at desc'),
        q('select release_id, stock from shop_stock'),
        q("select value from store_meta where key = 'doc'"),
      ]);

      const hasRows =
        orders.rows.length + shopOrders.rows.length + uploads.rows.length + events.rows.length > 0;
      if (!hasRows && meta.rows.length === 0) return null; // a brand-new database

      const stockMap = {};
      for (const row of stock.rows) stockMap[row.release_id] = Number(row.stock);

      return normalizeDoc({
        ...emptyDoc(),
        createdAt: meta.rows[0]?.value?.createdAt ?? new Date().toISOString(),
        orders: orders.rows.map((row) => row.data),
        uploads: uploads.rows.map((row) => row.data),
        events: events.rows.map((row) => row.data),
        shop: { stock: stockMap, orders: shopOrders.rows.map((row) => row.data) },
      });
    },

    /** Write only what changed. Safe to call concurrently for unrelated rows. */
    async save(prev, next) {
      await this.init();
      const sliceOf = (doc, name) =>
        name === 'shopOrders' ? doc?.shop?.orders ?? [] : doc?.[name] ?? [];

      const writes = TABLES.map((entry) => ({
        ...entry,
        diff: sliceDiff(sliceOf(prev, entry.slice), sliceOf(next, entry.slice)),
      })).filter((entry) => entry.diff.changed.length > 0 || entry.diff.removed.length > 0);

      const stockWrites = stockDiff(prev?.shop?.stock ?? {}, next?.shop?.stock ?? {});
      if (writes.length === 0 && stockWrites.length === 0) return;

      await withTransaction(async (tx) => {
        for (const entry of writes) {
          const columnNames = COLUMN_NAMES[entry.table];
          for (const item of entry.diff.changed) {
            const values = entry.columns(item);
            const insertColumns = ['id', ...columnNames, 'data'];
            const placeholders = insertColumns.map((_, index) => `$${index + 1}`).join(', ');
            const updateList = [
              ...columnNames.map((column) => `${column} = excluded.${column}`),
              'data = excluded.data',
              'updated_at = now()',
            ];
            await tx(
              `insert into ${entry.table} (${insertColumns.join(', ')}) values (${placeholders})
               on conflict (id) do update set ${updateList.join(', ')}`,
              [item.id, ...values.slice(0, columnNames.length), JSON.stringify(item)],
            );
          }
          for (const id of entry.diff.removed) {
            await tx(`delete from ${entry.table} where id = $1`, [id]);
          }
        }

        for (const [releaseId, value] of stockWrites) {
          await tx(
            `insert into shop_stock (release_id, stock) values ($1, $2)
             on conflict (release_id) do update set stock = excluded.stock, updated_at = now()`,
            [releaseId, value],
          );
        }

        await tx(
          `insert into store_meta (key, value) values ('doc', $1)
           on conflict (key) do update set value = excluded.value`,
          [JSON.stringify({ createdAt: next.createdAt, version: next.version, updatedAt: new Date().toISOString() })],
        );
      });
    },

    /**
     * Take the records out of stock or take nothing at all.
     * Returns the authoritative counts, so the caller can show the shelf.
     */
    async reserve(lines) {
      await this.init();
      return withTransaction(async (tx) => {
        const stock = {};
        for (const line of lines) {
          const result = await tx(
            `update shop_stock set stock = stock - $2, updated_at = now()
             where release_id = $1 and stock >= $2
             returning stock`,
            [line.releaseId, line.quantity],
          );
          // `pg` reports rowCount; PGlite reports rows only — accept either.
          if (result.rows.length === 0 || result.rowCount === 0) {
            const current = await tx('select stock from shop_stock where release_id = $1', [line.releaseId]);
            throw Object.assign(new Error('out_of_stock'), {
              outOfStock: {
                releaseId: line.releaseId,
                available: Number(current.rows[0]?.stock ?? 0),
              },
            });
          }
          stock[line.releaseId] = Number(result.rows[0].stock);
        }
        return { ok: true, stock };
      }).catch((error) => {
        if (error.outOfStock) return { ok: false, ...error.outOfStock };
        throw error;
      });
    },

    /** Overwrite a stock count from the console. */
    async setStock(releaseId, value) {
      await this.init();
      await q(
        `insert into shop_stock (release_id, stock) values ($1, $2)
         on conflict (release_id) do update set stock = excluded.stock, updated_at = now()`,
        [releaseId, value],
      );
      return value;
    },

    async refreshStock() {
      await this.init();
      const result = await q('select release_id, stock from shop_stock');
      const stock = {};
      for (const row of result.rows) stock[row.release_id] = Number(row.stock);
      return stock;
    },

    async reset(doc) {
      await this.init();
      await withTransaction(async (tx) => {
        for (const entry of TABLES) await tx(`delete from ${entry.table}`);
        await tx('delete from store_meta');
        const stock = doc.shop?.stock ?? seedStock();
        for (const [releaseId, value] of Object.entries(stock)) {
          await tx(
            `insert into shop_stock (release_id, stock) values ($1, $2)
             on conflict (release_id) do update set stock = excluded.stock, updated_at = now()`,
            [releaseId, value],
          );
        }
      });
    },

    async health() {
      const started = Date.now();
      try {
        await this.init();
        const result = await q(`select
            (select count(*) from pressing_orders) as orders,
            (select count(*) from shop_orders) as shop_orders,
            (select count(*) from alert_events) as events,
            (select count(*) from shop_stock) as stock_rows`);
        const row = result.rows[0] ?? {};
        return {
          ok: true,
          driver: 'postgres',
          label: 'PostgreSQL',
          persistent: true,
          latencyMs: Date.now() - started,
          counts: {
            orders: Number(row.orders ?? 0),
            shopOrders: Number(row.shop_orders ?? 0),
            events: Number(row.events ?? 0),
            stockRows: Number(row.stock_rows ?? 0),
          },
        };
      } catch (error) {
        return { ok: false, driver: 'postgres', label: 'PostgreSQL', persistent: true, error: error.message };
      }
    },

    async close() {
      if (ownsPool && pool) await pool.end().catch(() => {});
      pool = null;
      client = injectedClient ?? null;
      ownsPool = false;
      ready = null;
    },
  };
}

export const POSTGRES_SCHEMA = SCHEMA;
export const POSTGRES_TABLES = TABLES.map((entry) => entry.table);
