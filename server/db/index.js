/**
 * Which database are we on?
 *
 * One place decides, so the rest of the server never asks. In order of
 * preference:
 *
 *   DATABASE_URL=postgres://…            → PostgreSQL (Neon, Supabase, Vercel, RDS)
 *   KV_REST_API_URL + KV_REST_API_TOKEN  → Upstash Redis / Vercel KV
 *   UPSTASH_REDIS_REST_URL + …_TOKEN     → the same, under Upstash's own names
 *   nothing                              → the local JSON file (development)
 *
 * The chosen driver is reported by `GET /api/health` and on the console, so
 * "is this actually persistent?" is answerable from the browser rather than by
 * reading environment variables.
 */
import { fileDriver } from './file.js';
import { postgresDriver } from './postgres.js';
import { redisDriver } from './redis.js';

export const DRIVER_PRIORITY = ['postgres', 'redis', 'file'];

export function describeDrivers(env = process.env) {
  return {
    postgres: {
      configured: Boolean(env.DATABASE_URL),
      variable: 'DATABASE_URL',
      persistent: true,
    },
    redis: {
      configured: Boolean(redisConfig(env)),
      variable: 'KV_REST_API_URL + KV_REST_API_TOKEN',
      persistent: true,
    },
    file: { configured: true, variable: 'DATA_DIR', persistent: false },
  };
}

function redisConfig(env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

export function createDriver({ env = process.env, file, dataDir, overrides = {} } = {}) {
  if (env.DATABASE_URL && !overrides.forceFile) {
    return postgresDriver({ url: env.DATABASE_URL, ...overrides.postgres });
  }

  const redis = redisConfig(env);
  if (redis && !overrides.forceFile) {
    return redisDriver({ ...redis, ...overrides.redis });
  }

  return fileDriver({ file, dataDir });
}

export { postgresDriver, redisDriver, fileDriver };
