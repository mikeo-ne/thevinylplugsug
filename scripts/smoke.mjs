/**
 * jsdom smoke test — renders each route through Vite's SSR module loader and
 * asserts the app mounted without runtime errors. Run with `node scripts/smoke.mjs`
 * while the dev server is running on PORT (default 4173).
 */
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const PORT = process.env.PORT ?? '4173';
const BASE = `http://localhost:${PORT}`;
const routes = ['/', '/order', '/order/NOPE-404', '/admin', '/does-not-exist'];

const failures = [];

function installDom(url) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: `${BASE}${url}`,
    pretendToBeVisual: true,
  });
  const { window } = dom;

  global.window = window;
  global.document = window.document;
  Object.defineProperty(global, 'navigator', {
    value: window.navigator,
    configurable: true,
    writable: true,
  });
  global.location = window.location;
  global.history = window.history;
  global.HTMLElement = window.HTMLElement;
  global.Element = window.Element;
  global.Node = window.Node;
  global.Event = window.Event;
  global.CustomEvent = window.CustomEvent;
  global.MouseEvent = window.MouseEvent;
  global.getComputedStyle = window.getComputedStyle;
  global.requestAnimationFrame = (cb) => window.setTimeout(() => cb(Date.now()), 16);
  global.cancelAnimationFrame = (id) => window.clearTimeout(id);
  global.sessionStorage = window.sessionStorage;
  global.localStorage = window.localStorage;
  global.fetch = (input, init) =>
    fetchImpl(typeof input === 'string' ? `${BASE}${input}` : input, init);
  window.fetch = global.fetch;
  window.scrollTo = () => {};
  window.matchMedia = window.matchMedia ?? (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));

  return dom;
}

const fetchImpl = globalThis.fetch;

const errors = [];
const originalError = console.error;
console.error = (...args) => {
  const text = args.map(String).join(' ');
  if (text.includes('not wrapped in act')) return;
  errors.push(text);
  originalError(...args);
};

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});

for (const route of routes) {
  errors.length = 0;
  const dom = installDom(route);
  try {
    // Fresh module graph per route so React mounts into the new document.
    const mod = await vite.ssrLoadModule(`/src/main.tsx?route=${encodeURIComponent(route)}`);
    void mod;
    await new Promise((resolve) => setTimeout(resolve, 900));

    const root = dom.window.document.getElementById('root');
    const html = root?.innerHTML ?? '';
    const text = root?.textContent ?? '';

    if (html.length < 300) {
      failures.push(`${route}: root rendered only ${html.length} chars`);
    }
    if (errors.length > 0) {
      failures.push(`${route}: console errors → ${errors.slice(0, 2).join(' | ').slice(0, 400)}`);
    }

    // Contact details must be the real ones on every page that shows them.
    if (route === '/') {
      const hrefs = [...root.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'));
      if (!hrefs.some((href) => href.includes('wa.me/256768261003'))) {
        failures.push(`${route}: no WhatsApp link to the real desk number (wa.me/256768261003)`);
      }
      if (!text.includes('256 768 261 003')) {
        failures.push(`${route}: the desk phone number is not rendered`);
      }
      if (hrefs.some((href) => /wa\.me\/256700411700/.test(href ?? ''))) {
        failures.push(`${route}: stale placeholder WhatsApp number still linked`);
      }
    }

    const probe = text.replace(/\s+/g, ' ').slice(0, 140);
    console.log(`${route.padEnd(22)} ${String(html.length).padStart(6)} chars · ${probe}`);
  } catch (error) {
    failures.push(`${route}: ${error.message}`);
    console.log(`${route.padEnd(22)} FAILED — ${error.message}`);
  } finally {
    dom.window.close();
  }
}

await vite.close();

if (failures.length > 0) {
  console.log('\nFAILURES');
  failures.forEach((failure) => console.log(' -', failure));
  process.exit(1);
}
console.log('\nAll routes rendered without runtime errors.');
