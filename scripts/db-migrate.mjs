#!/usr/bin/env node
/**
 * Create the schema, import the old file store, and prove the connection works.
 *
 *   DATABASE_URL=postgres://… npm run db:migrate                 # create tables + seed stock
 *   DATABASE_URL=postgres://… npm run db:migrate -- --import data/db.json
 *   DATABASE_URL=postgres://… npm run db:migrate -- --check      # health, no writes
 *
 * Safe to run more than once: every statement is `create table if not exists`
 * and the import upserts by id.
 */
import fs from 'node:fs';
import path from 'node:path';

import { postgresDriver, POSTGRES_TABLES } from '../server/db/postgres.js';
import { postgresUrl } from '../server/db/index.js';
import { normalizeDoc } from '../server/db/document.js';

const args = process.argv.slice(2);
const flag = (...names) => names.find((name) => args.includes(name));
const valueOf = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};

const configured = postgresUrl();
const url = configured?.url ?? null;
if (!url) {
  console.error('DATABASE_URL is not set. Point it at a Postgres database, e.g.');
  console.error('  DATABASE_URL=postgres://user:pass@host/db?sslmode=require npm run db:migrate');
  process.exit(1);
}

const driver = postgresDriver({ url });
const host = (() => {
  try {
    // Never print the password, even when the URL is pasted into a terminal.
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return 'the configured database';
  }
})();

try {
  if (flag('--check', '--test')) {
    const health = await driver.health();
    console.log(`→ ${host} (from ${configured.variable})`);
    if (!health.ok) {
      console.error(`✗ ${health.error}`);
      process.exit(1);
    }
    console.log(`✓ connected in ${health.latencyMs}ms`);
    console.log(`  orders ${health.counts.orders} · shop orders ${health.counts.shopOrders} · alerts ${health.counts.events}`);
    process.exit(0);
  }

  console.log(`→ ${host}`);
  await driver.init();
  console.log(`✓ schema ready (${POSTGRES_TABLES.join(', ')}, shop_stock, store_meta)`);

  const importPath = valueOf('--import');
  if (importPath) {
    const absolute = path.resolve(process.cwd(), importPath);
    if (!fs.existsSync(absolute)) {
      console.error(`✗ ${importPath} does not exist`);
      process.exit(1);
    }
    const doc = normalizeDoc(JSON.parse(fs.readFileSync(absolute, 'utf8')));
    await driver.save(null, doc);
    console.log(
      `✓ imported ${doc.orders.length} orders, ${doc.shop.orders.length} shop orders, ` +
        `${doc.uploads.length} files, ${doc.events.length} alert events`,
    );
  }

  const health = await driver.health();
  console.log(
    `✓ ${health.counts.orders} orders · ${health.counts.shopOrders} shop orders · ` +
      `${health.counts.events} alerts · ${health.counts.stockRows} stock rows`,
  );
  console.log('\nSet DATABASE_URL in Vercel (Production + Preview) and redeploy.');
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
} finally {
  await driver.close().catch(() => {});
}
