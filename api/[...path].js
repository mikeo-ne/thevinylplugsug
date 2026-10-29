/**
 * Vercel serverless entry point.
 *
 * `api/[...path].js` is a catch-all so every `/api/*` request reaches this
 * Express app. The React build is served statically from `dist/` by Vercel's
 * CDN — this function never handles page routes.
 */
import express from 'express';

import api, { apiErrorHandler } from '../server/app.js';

const app = express();
const server = app;

server.disable('x-powered-by');
server.set('trust proxy', true);

// Vercel preserves the original URL, but normalise defensively in case a
// deployment is mounted with the /api prefix stripped.
server.use((req, _res, next) => {
  const url = req.url || '/';
  if (!url.startsWith('/api')) req.url = `/api${url.startsWith('/') ? '' : '/'}${url}`;
  next();
});

server.use(api);
server.use(apiErrorHandler);

export default app;
