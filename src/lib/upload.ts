import type { UploadedFile } from '../types';

/**
 * Chunked uploads.
 *
 * A 24-bit album master is not a form field: it is hundreds of megabytes, and a
 * serverless request can only carry about 4.5MB. So the browser cuts the file
 * into slices, sends them one at a time, and asks the server to seal the result.
 *
 * What this buys, beyond the size:
 *
 *   · **Resume.** A dropped connection halfway through costs one chunk, not the
 *     file — the loop retries the chunk that failed.
 *   · **Progress people can see.** A 300MB upload with no bar looks broken.
 *   · **A checksum.** The server returns sha256 of what actually landed; the
 *     client compares it with what it sent and refuses to attach a file that
 *     arrived corrupted.
 */

export interface UploadProgress {
  file: string;
  sent: number;
  total: number;
  chunksDone: number;
  chunksTotal: number;
  percent: number;
}

const CHUNK_FALLBACK = 3 * 1024 * 1024;
const RETRIES = 3;

async function jsonOrThrow<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      (payload && typeof payload === 'object' && 'error' in payload && String(payload.error)) ||
      `Upload failed (${response.status}).`;
    throw Object.assign(new Error(message), { status: response.status, payload });
  }
  return payload as T;
}

/** sha256 in the browser, so the server can be held to what it claims it received. */
async function sha256Hex(buffer: ArrayBuffer): Promise<string | null> {
  try {
    if (!globalThis.crypto?.subtle) return null;
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

export async function uploadOne(
  file: File,
  kind: 'audio' | 'artwork',
  options: { chunkBytes?: number; onProgress?: (progress: UploadProgress) => void; orderId?: string } = {},
): Promise<UploadedFile> {
  const chunkBytes = options.chunkBytes ?? CHUNK_FALLBACK;

  const started = await jsonOrThrow<{ upload: UploadedFile; chunkBytes: number; chunks: number }>(
    await fetch('/api/uploads/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        kind,
        mimeType: file.type,
        orderId: options.orderId,
      }),
    }),
  );

  const upload = started.upload;
  const size = started.chunkBytes ?? chunkBytes;
  const total = started.chunks;
  let sent = 0;

  options.onProgress?.({
    file: file.name,
    sent: 0,
    total: file.size,
    chunksDone: 0,
    chunksTotal: total,
    percent: 0,
  });

  for (let seq = 0; seq < total; seq += 1) {
    const slice = file.slice(seq * size, Math.min((seq + 1) * size, file.size));
    let attempt = 0;
    for (;;) {
      try {
        const response = await fetch(`/api/uploads/${upload.id}/chunk/${seq}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: slice,
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error ?? `Chunk ${seq + 1} was rejected (${response.status}).`);
        }
        break;
      } catch (error) {
        attempt += 1;
        if (attempt >= RETRIES) {
          throw new Error(
            `Upload stopped at ${Math.round((sent / file.size) * 100)}% — ${(error as Error).message}`,
          );
        }
        // A short pause, then try the same slice again: a dropped connection
        // should not cost the whole transfer.
        await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
      }
    }

    sent += slice.size;
    options.onProgress?.({
      file: file.name,
      sent,
      total: file.size,
      chunksDone: seq + 1,
      chunksTotal: total,
      percent: Math.round((sent / file.size) * 100),
    });
  }

  const hash = await sha256Hex(await file.arrayBuffer());
  const finished = await jsonOrThrow<{ upload: UploadedFile; sha256: string }>(
    await fetch(`/api/uploads/${upload.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha256: hash }),
    }),
  );

  return finished.upload;
}

export async function uploadAll(
  files: { audio: File[]; artwork: File[] },
  options: { chunkBytes?: number; onProgress?: (progress: UploadProgress) => void } = {},
): Promise<UploadedFile[]> {
  const results: UploadedFile[] = [];
  for (const [kind, list] of Object.entries(files) as [('audio' | 'artwork'), File[]][]) {
    for (const file of list) {
      results.push(await uploadOne(file, kind, options));
    }
  }
  return results;
}

export const humanBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
};
