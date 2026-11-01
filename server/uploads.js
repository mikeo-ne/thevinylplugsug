/**
 * File storage — organised, durable, and bigger than a form post.
 *
 * Three problems, one module:
 *
 *   1. **4 MB was too small for a WAV.** Vercel caps a serverless request body at
 *      ~4.5 MB, so raising a number in a config file would only move the failure.
 *      Files are therefore uploaded in chunks the browser slices off the disk; a
 *      300 MB master is 100 requests, each comfortably under the platform cap.
 *   2. **The bytes were not stored anywhere real.** They landed in `/tmp` on
 *      whichever function instance handled the request, and vanished with it. When
 *      Postgres is configured the chunks go in the database, so a master is still
 *      there after a cold start, a redeploy and a rollback.
 *   3. **Nobody could find anything.** Every upload now carries a folder
 *      (`orders/7H-2026-8K2Q/audio`), a sha256, a chunk count and a size, and the
 *      console lists them grouped that way with a download link.
 *
 * The chunk store is deliberately dumb: append-only rows keyed by (upload, seq).
 * A half-finished upload is just missing rows, which makes resuming trivial and
 * garbage-collection a single query.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './store.js';

/** 3 MB: under Vercel's 4.5 MB body cap with room for headers and framing. */
export const CHUNK_BYTES = Math.max(
  256 * 1024,
  Math.min(3 * 1024 * 1024, Number(process.env.UPLOAD_CHUNK_BYTES ?? 3 * 1024 * 1024)),
);

const HOUR = 60 * 60 * 1000;
/** An upload nobody finished is dead after this long. */
export const ABANDONED_AFTER_MS = Number(process.env.UPLOAD_ABANDONED_HOURS ?? 48) * HOUR;

const BLOB_DIR = path.join(DATA_DIR, 'blobs');

const chunkPath = (uploadId, seq) => path.join(BLOB_DIR, uploadId, `${String(seq).padStart(6, '0')}.part`);

/* ------------------------------------------------------------------ *
 * The two backends behind one interface
 * ------------------------------------------------------------------ */

/**
 * Postgres: the real store. Rows are small and append-only, which is exactly what
 * a bytea column is good at, and it is the only backend here that survives a
 * deploy on Vercel.
 */
const postgresStore = (driver) => ({
  name: 'postgres',
  label: 'PostgreSQL (upload_chunks)',

  async init() {
    await driver.query(`
      create table if not exists upload_chunks (
        upload_id text not null,
        seq       integer not null,
        bytes     bytea not null,
        size      integer not null,
        primary key (upload_id, seq)
      )
    `);
    await driver.query('create index if not exists upload_chunks_upload_idx on upload_chunks (upload_id)');
  },

  async put(uploadId, seq, buffer) {
    await this.init();
    await driver.query(
      `insert into upload_chunks (upload_id, seq, bytes, size) values ($1, $2, $3, $4)
       on conflict (upload_id, seq) do update set bytes = excluded.bytes, size = excluded.size`,
      [uploadId, seq, buffer, buffer.length],
    );
    return buffer.length;
  },

  async hasSeq(uploadId, seq) {
    await this.init();
    const result = await driver.query('select 1 from upload_chunks where upload_id = $1 and seq = $2', [
      uploadId,
      seq,
    ]);
    return result.rowCount > 0;
  },

  async listSeqs(uploadId) {
    await this.init();
    const result = await driver.query('select seq, size from upload_chunks where upload_id = $1 order by seq', [
      uploadId,
    ]);
    return result.rows.map((row) => ({ seq: Number(row.seq), size: Number(row.size) }));
  },

  async read(uploadId, seq) {
    await this.init();
    const result = await driver.query('select bytes from upload_chunks where upload_id = $1 and seq = $2', [
      uploadId,
      seq,
    ]);
    return result.rowCount ? result.rows[0].bytes : null;
  },

  async drop(uploadId) {
    await this.init();
    await driver.query('delete from upload_chunks where upload_id = $1', [uploadId]);
  },

  /** Sequential read for streaming a download without buffering the whole file. */
  async *stream(uploadId) {
    const seqs = await this.listSeqs(uploadId);
    for (const { seq } of seqs) {
      const chunk = await this.read(uploadId, seq);
      if (chunk) yield Buffer.from(chunk);
    }
  },

  async stats() {
    await this.init();
    const result = await driver.query(
      'select count(distinct upload_id) as files, coalesce(sum(size), 0) as bytes from upload_chunks',
    );
    const row = result.rows[0] ?? {};
    return { files: Number(row.files ?? 0), bytes: Number(row.bytes ?? 0) };
  },

  async abandoned(cutoffIso) {
    await this.init();
    // Chunks whose upload never completed. The uploads table is the source of
    // truth for completion, so this only reports orphans.
    const result = await driver.query(
      `select distinct c.upload_id
         from upload_chunks c
         left join uploads u on u.id = c.upload_id
        where u.id is null`,
    );
    return result.rows.map((row) => row.upload_id).filter(Boolean);
  },
});

/** Disk: fine on a laptop, honest about not being durable on Vercel. */
const fileStore = () => ({
  name: 'file',
  label: `Local disk (${path.join('DATA_DIR', 'blobs')})`,

  async init() {
    await fsp.mkdir(BLOB_DIR, { recursive: true });
  },

  async put(uploadId, seq, buffer) {
    await this.init();
    await fsp.mkdir(path.join(BLOB_DIR, uploadId), { recursive: true });
    await fsp.writeFile(chunkPath(uploadId, seq), buffer);
    return buffer.length;
  },

  async hasSeq(uploadId, seq) {
    return fs.existsSync(chunkPath(uploadId, seq));
  },

  async listSeqs(uploadId) {
    await this.init();
    const dir = path.join(BLOB_DIR, uploadId);
    if (!fs.existsSync(dir)) return [];
    const names = await fsp.readdir(dir);
    return names
      .filter((name) => name.endsWith('.part'))
      .map((name) => Number(name.replace('.part', '')))
      .filter((seq) => Number.isFinite(seq))
      .sort((a, b) => a - b)
      .map((seq) => ({ seq, size: fs.statSync(chunkPath(uploadId, seq)).size }));
  },

  async read(uploadId, seq) {
    const file = chunkPath(uploadId, seq);
    return fs.existsSync(file) ? fsp.readFile(file) : null;
  },

  async drop(uploadId) {
    await fsp.rm(path.join(BLOB_DIR, uploadId), { recursive: true, force: true });
  },

  async *stream(uploadId) {
    const seqs = await this.listSeqs(uploadId);
    for (const { seq } of seqs) {
      const chunk = await this.read(uploadId, seq);
      if (chunk) yield chunk;
    }
  },

  async stats() {
    await this.init();
    let files = 0;
    let bytes = 0;
    for (const uploadId of await fsp.readdir(BLOB_DIR)) {
      files += 1;
      for (const { size } of await this.listSeqs(uploadId)) bytes += size;
    }
    return { files, bytes };
  },

  async abandoned() {
    return [];
  },
});

let cached = null;

/** Pick the durable store when the driver offers SQL access. */
export async function chunkStore() {
  if (cached) return cached;
  const { db_ } = await import('./store.js');
  const driver = db_?.driver?.name;
  if (driver === 'postgres') {
    const { postgresQuery } = await import('./store.js');
    const query = await postgresQuery();
    if (query) {
      cached = postgresStore({ query });
      await cached.init();
      return cached;
    }
  }
  cached = fileStore();
  await cached.init();
  return cached;
}

/** Test seam: forget the chosen backend (a harness swaps DATABASE_URL between runs). */
export const resetChunkStoreForTests = () => {
  cached = null;
};

/* ------------------------------------------------------------------ *
 * Upload sessions
 * ------------------------------------------------------------------ */

export const folderFor = ({ orderId, kind, createdAt = new Date() }) => {
  const month = createdAt.toISOString().slice(0, 7);
  const safeKind = kind === 'artwork' ? 'artwork' : 'audio';
  // Attached to an order → filed under it; not yet attached → dated inbox.
  return orderId ? `orders/${orderId}/${safeKind}` : `inbox/${month}/${safeKind}`;
};

export const uploadUrl = (id) => `/api/files/${id}/download`;

/**
 * How many chunks a file needs. Sent to the browser so it can slice the file
 * identically; recomputed here so a client cannot claim a different size later.
 */
export const expectedChunks = (size) => Math.max(1, Math.ceil(Number(size) / CHUNK_BYTES));

/**
 * Finish an upload: every chunk must be present and the total must match what
 * the client declared. Returns the checksum so the caller can store it and the
 * browser can verify the transfer end-to-end.
 */
export async function finaliseUpload(record) {
  const store = await chunkStore();
  const seqs = await store.listSeqs(record.id);
  const expected = expectedChunks(record.size);

  if (seqs.length === 0) {
    return { ok: false, error: 'No chunks arrived for this upload.', missing: expected };
  }
  const present = new Set(seqs.map((entry) => entry.seq));
  const missing = [];
  for (let index = 0; index < expected; index += 1) {
    if (!present.has(index)) missing.push(index);
  }
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Upload incomplete — ${missing.length} of ${expected} chunks never arrived.`,
      missing: missing.length,
      received: seqs.length,
      expected,
    };
  }

  const total = seqs.reduce((sum, entry) => sum + entry.size, 0);
  if (total !== Number(record.size)) {
    return {
      ok: false,
      error: `Upload size mismatch — the browser declared ${record.size} bytes, ${total} arrived.`,
      bytes: total,
    };
  }

  const hash = crypto.createHash('sha256');
  for await (const chunk of store.stream(record.id)) hash.update(chunk);

  return {
    ok: true,
    sha256: hash.digest('hex'),
    bytes: total,
    chunks: expected,
    storage: store.name,
    storageLabel: store.label,
  };
}

/**
 * An async iterator over the file's chunks, in order.
 *
 * The download route pipes this straight into the response: buffering a 250MB
 * master in a function's memory to hand it back would be a good way to run out.
 */
export async function openUploadStream(record) {
  const store = await chunkStore();
  const seqs = await store.listSeqs(record.id);
  if (seqs.length === 0) return null;
  return store.stream(record.id);
}

/** Fully buffered read — tests and small files. */
export async function readUpload(record) {
  const stream = await openUploadStream(record);
  if (!stream) return null;
  const buffers = [];
  for await (const chunk of stream) buffers.push(chunk);
  return Buffer.concat(buffers);
}

export async function dropUpload(id) {
  const store = await chunkStore();
  await store.drop(id);
}

export async function storageStats() {
  const store = await chunkStore();
  return { ...(await store.stats()), driver: store.name, label: store.label, durable: store.name === 'postgres' };
}

/**
 * Reap uploads nobody finished. Called by the daily cron: a client who closed the
 * tab mid-WAV should not leave 200 MB in the database forever.
 */
export async function reapAbandonedUploads({ now = Date.now(), limit = 50 } = {}) {
  const { db_ } = await import('./store.js');
  const db = db_.data;
  const store = await chunkStore();
  const cutoff = new Date(now - ABANDONED_AFTER_MS).toISOString();
  let dropped = 0;

  const stale = db.uploads.filter(
    (record) => record.status === 'uploading' && new Date(record.createdAt).getTime() < now - ABANDONED_AFTER_MS,
  );
  for (const record of stale.slice(0, limit)) {
    await store.drop(record.id);
    const index = db.uploads.findIndex((item) => item.id === record.id);
    if (index >= 0) db.uploads.splice(index, 1);
    dropped += 1;
  }

  // Orphans: chunks with no record at all (a crash between the two writes).
  for (const id of (await store.abandoned(cutoff)) ?? []) {
    if (db.uploads.some((record) => record.id === id)) continue;
    await store.drop(id);
    dropped += 1;
  }

  if (dropped > 0) db_.save();
  return { dropped, cutoff };
}
