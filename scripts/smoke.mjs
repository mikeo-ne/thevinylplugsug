/**
 * jsdom smoke test — renders each route through Vite's SSR module loader and
 * asserts the app mounted without runtime errors. Run with `node scripts/smoke.mjs`
 * while the dev server is running on PORT (default 4173).
 */
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const PORT = process.env.PORT ?? '4173';
const BASE = `http://localhost:${PORT}`;
const routes = [
  '/',
  '/shop',
  '/shop/order/7H-SHOP-NOPE',
  '/order',
  '/order/NOPE-404',
  '/admin',
  '/does-not-exist',
];

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

    // The pressing checkout has to capture a courier-complete address and say
    // plainly that the run is made to order, shipped from the plant.
    if (route === '/order') {
      for (const label of ['Recipient full name', 'Street address / plot number', 'Region / state / county', 'Postal / ZIP code']) {
        if (!text.includes(label)) failures.push(`${route}: address field "${label}" is missing`);
      }
      if (!text.includes('Custom On-Demand Manufacturing')) {
        failures.push(`${route}: the on-demand manufacturing notice is missing`);
      }
      if (!text.includes('shipped directly from our international production facilities straight to your doorstep')) {
        failures.push(`${route}: the on-demand notice copy has drifted`);
      }
    }

    if (route === '/') {
      if (!text.includes('Sample pressings')) {
        failures.push(`${route}: the sample pressings section is missing`);
      }
      if (text.includes('Naledi Sound')) {
        failures.push(`${route}: invented client pressings are back on the page`);
      }

      // The run-size ladder: seven tiers, from a single lathe cut to a plant run.
      const tiers = [...root.querySelectorAll('[aria-label*=" units — "]')].map((el) =>
        (el.getAttribute('aria-label') ?? '').split(' ')[0],
      );
      const expectedTiers = ['1', '25', '50', '100', '250', '500', '1,000'];
      if (JSON.stringify(tiers) !== JSON.stringify(expectedTiers)) {
        failures.push(`${route}: quantity ladder is ${tiers.join('/') || 'missing'}, expected ${expectedTiers.join('/')}`);
      }
      if (text.includes('Minimum pressing run: 100')) {
        failures.push(`${route}: the old 100-unit minimum is still printed`);
      }

      // The plant dropdown must list all six plants with their MOQs.
      const plantSelect = root.querySelector('#plant-select');
      const plantOptions = plantSelect ? [...plantSelect.querySelectorAll('option')] : [];
      if (plantOptions.length !== 6) {
        failures.push(`${route}: plant dropdown has ${plantOptions.length} options, expected 6`);
      }
      for (const name of ['Mobineko', 'Green Lakes', 'Seabass', 'Dr. Dub', 'GZ Media', 'Deepgrooves']) {
        if (!plantOptions.some((option) => (option.textContent ?? '').includes(name))) {
          failures.push(`${route}: plant dropdown is missing ${name}`);
        }
      }
      const moqs = plantOptions.map((option) => (option.textContent ?? '').match(/MOQ (\d+)/)?.[1]).join(',');
      if (moqs !== '25,100,50,1,250,100') {
        failures.push(`${route}: plant MOQs are ${moqs}, expected 25,100,50,1,250,100`);
      }
      // A fixed pixel width larger than a small phone makes the whole page scroll
      // sideways — the exact bug that cut the hero off on mobile.
      const wide = [...root.querySelectorAll('[style]')]
        .map((el) => el.getAttribute('style') ?? '')
        .map((style) => Number(style.match(/(?:^|;)\s*width:\s*(\d+)px/)?.[1] ?? 0))
        .filter((width) => width > 360);
      if (wide.length > 0) {
        failures.push(`${route}: fixed width ${Math.max(...wide)}px will overflow a 360px phone`);
      }
      // The admin passcode must never be printed anywhere a visitor can read it.
    }

    if (text.includes('7HADMIN')) {
      failures.push(`${route}: the admin access code is rendered on the page`);
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
