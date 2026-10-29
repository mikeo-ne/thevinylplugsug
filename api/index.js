/**
 * Vercel serverless entry point.
 *
 * Vercel mounts plain (non-Next) functions at the literal path of their file, so
 * a `[...path].js` filename is served at `/api/[...path]` rather than acting as
 * a catch-all. We therefore export a single function from `api/index.js`
 * (mounted at `/api`) and forward every API route into it from `vercel.json`:
 *
 *   { "source": "/api/(.*)", "destination": "/api?path=$1" }
 *
 * This middleware rebuilds the original URL (`/api/<path>`, original query
 * params intact) before handing off to the Express router in `server/app.js`.
 *
 * The React build is served statically from `dist/` by Vercel's CDN — this
 * function never handles page routes.
 */
import express from 'express';

import api, { apiErrorHandler } from '../server/app.js';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', true);

app.use((req, _res, next) => {
  const { path: captured, ...rest } = req.query;

  if (typeof captured === 'string' && captured.length > 0) {
    // `path` is removed so it never reaches the API as a stray query param.
    req.query = rest;
    const suffix = new URLSearchParams(
      Object.entries(rest).flatMap(([key, value]) =>
        Array.isArray(value) ? value.map((item) => [key, String(item)]) : [[key, String(value)]],
      ),
    ).toString();
    req.url = `/api/${captured.replace(/^\/+/, '')}${suffix ? `?${suffix}` : ''}`;
  } else if (!req.url.startsWith('/api/')) {
    // Direct hit on /api (health probe) or a deployment without the rewrite.
    req.url = req.url.startsWith('/api') ? req.url : `/api${req.url}`;
  }

  next();
});

app.use(api);
app.use(apiErrorHandler);

export default app;
