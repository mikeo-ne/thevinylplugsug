/**
 * Local file driver — the development default.
 *
 * Keeps the old behaviour exactly: one JSON document on disk, rewritten after
 * each change. It is deliberately *not* persistent on Vercel (the function's
 * filesystem is `/tmp`), which is why the admin console reports the driver it is
 * running on and says so plainly.
 */
import fs from 'node:fs';
import path from 'node:path';
import { normalizeDoc, sliceDiff, stockDiff } from './document.js';

export function fileDriver({ file, dataDir }) {
  let queue = Promise.resolve();

  const ensureDir = () => {
    if (dataDir) fs.mkdirSync(dataDir, { recursive: true });
  };

  return {
    name: 'file',
    label: 'Local JSON file',
    persistent: false,
    file,

    async init() {
      ensureDir();
      return true;
    },

    async load() {
      ensureDir();
      try {
        if (!fs.existsSync(file)) return null;
        const parsed = JSON.parse(await fs.promises.readFile(file, 'utf8'));
        return normalizeDoc(parsed);
      } catch (error) {
        console.warn('[db:file] Could not read the store, starting fresh.', error.message);
        return null;
      }
    },

    async save(prev, next) {
      ensureDir();
      const snapshot = JSON.stringify(next, null, 2);
      queue = queue.then(async () => {
        const tmp = `${file}.tmp`;
        await fs.promises.writeFile(tmp, snapshot, 'utf8');
        await fs.promises.rename(tmp, file);
      }).catch((error) => {
        console.warn('[db:file] Could not persist the store (running in memory):', error.message);
      });
      return queue;
    },

    /**
     * The file driver has no external writers, so the in-memory counts are the
     * truth; the caller has already checked them.
     */
    async reserve(lines) {
      return { ok: true, stock: null, lines };
    },

    async setStock(releaseId, value) {
      return value;
    },

    async refreshStock() {
      return null;
    },

    async reset(doc) {
      await this.save(null, doc);
    },

    async health() {
      const started = Date.now();
      try {
        const exists = fs.existsSync(file);
        return {
          ok: true,
          driver: 'file',
          label: 'Local JSON file',
          persistent: false,
          latencyMs: Date.now() - started,
          detail: exists ? path.relative(process.cwd(), file) : 'not created yet',
        };
      } catch (error) {
        return { ok: false, driver: 'file', label: 'Local JSON file', persistent: false, error: error.message };
      }
    },

    async close() {
      await queue.catch(() => {});
    },
  };
}

/** Re-exported so the diff helpers stay in one place for tests. */
export const fileHelpers = { sliceDiff, stockDiff };
