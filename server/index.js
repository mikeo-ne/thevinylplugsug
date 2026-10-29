import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import { ADMIN_PASSCODE, IS_PRODUCTION, PORT } from './config.js';
import { ROOT_DIR, ensureDirs } from './store.js';
import api, { apiErrorHandler } from './app.js';

const DIST_DIR = path.join(ROOT_DIR, 'dist');

const app = express();
const server = http.createServer(app);

app.disable('x-powered-by');
app.use(api);

async function attachFrontend() {
  if (IS_PRODUCTION) {
    if (!fs.existsSync(DIST_DIR)) {
      console.error('[7h] No production build found. Run `npm run build` first.');
      process.exit(1);
    }
    app.use(express.static(DIST_DIR, { index: false, maxAge: '1h' }));
    app.get('*', (req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')));
    return;
  }

  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: {
      middlewareMode: true,
      hmr: { server },
      allowedHosts: true,
    },
    appType: 'custom',
  });

  app.use(vite.middlewares);
  app.use('*', async (req, res, next) => {
    try {
      const template = await fs.promises.readFile(path.join(ROOT_DIR, 'index.html'), 'utf8');
      const html = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
    } catch (error) {
      vite.ssrFixStacktrace(error);
      next(error);
    }
  });
}

async function start() {
  ensureDirs();
  await attachFrontend();
  app.use(apiErrorHandler);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  7H MUSIC GROUP — vinyl portal`);
    console.log(`  → http://0.0.0.0:${PORT}  (${IS_PRODUCTION ? 'production' : 'development'})`);
    console.log(`  → admin access code: ${ADMIN_PASSCODE}\n`);
  });
}

start().catch((error) => {
  console.error('[7h] Failed to start server', error);
  process.exit(1);
});
