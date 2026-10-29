/**
 * End-to-end flow test in jsdom: fills the client portal, submits an order and
 * asserts the success screen + admin console receive it. Requires the dev server.
 */
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const PORT = process.env.PORT ?? '4173';
const BASE = `http://localhost:${PORT}`;
const fetchImpl = globalThis.fetch;

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: `${BASE}/order`,
  pretendToBeVisual: true,
});
const { window } = dom;
const { document } = window;

global.window = window;
global.document = document;
Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true, writable: true });
global.location = window.location;
global.history = window.history;
global.HTMLElement = window.HTMLElement;
global.Element = window.Element;
global.Node = window.Node;
global.Event = window.Event;
global.MouseEvent = window.MouseEvent;
global.getComputedStyle = window.getComputedStyle;
global.requestAnimationFrame = (cb) => window.setTimeout(() => cb(Date.now()), 16);
global.sessionStorage = window.sessionStorage;
global.localStorage = window.localStorage;
global.fetch = (input, init) => fetchImpl(typeof input === 'string' ? `${BASE}${input}` : input, init);
window.fetch = global.fetch;
window.scrollTo = () => {};

const errors = [];
const originalError = console.error;
console.error = (...args) => {
  const text = args.map(String).join(' ');
  if (text.includes('not wrapped in act') || text.includes('Future Flag')) return;
  errors.push(text);
  originalError(...args);
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const text = () => document.getElementById('root').textContent.replace(/\s+/g, ' ');

function setValue(element, value) {
  const prototype =
    element instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
  element.dispatchEvent(new window.Event('input', { bubbles: true }));
}

function field(labelText) {
  const labels = [...document.querySelectorAll('label')];
  const match = labels.find((label) => label.textContent.trim().toLowerCase().startsWith(labelText.toLowerCase()));
  if (!match) throw new Error(`Field "${labelText}" not found`);
  return match.querySelector('input, textarea, select');
}

function button(labelText) {
  const match = [...document.querySelectorAll('button')].find((element) =>
    element.textContent.trim().toLowerCase().includes(labelText.toLowerCase()),
  );
  if (!match) throw new Error(`Button "${labelText}" not found`);
  return match;
}

const checks = [];
const assert = (condition, message) => {
  checks.push({ ok: Boolean(condition), message });
  console.log(`${condition ? '✓' : '✗'} ${message}`);
};

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

try {
  await vite.ssrLoadModule('/src/main.tsx');
  await wait(800);

  assert(text().includes('Place your pressing order'), 'order portal mounted');

  setValue(field('Artist / Label name'), 'Flow Test Collective');
  setValue(field('Contact email'), 'flow@test.io');
  setValue(field('WhatsApp number'), '+256 772 555 111');
  setValue(field('Delivery address'), '12 Bukoto Street, Kamwokya');
  setValue(field('City / town'), 'Kampala');
  button('Continue').click();
  await wait(120);

  assert(text().includes('Masters & artwork'), 'advanced to the file step');

  setValue(document.getElementById('audio-link'), 'https://drive.google.com/master.wav');
  setValue(document.getElementById('artwork-link'), 'https://drive.google.com/art.pdf');
  button('Continue').click();
  await wait(120);

  assert(text().includes('Payment method'), 'advanced to the payment step');

  const terms = [...document.querySelectorAll('input[type="checkbox"]')][0];
  terms.click();
  await wait(80);
  button('Continue').click();
  await wait(120);

  assert(text().includes('Review & checkout'), 'advanced to review step');
  assert(text().includes('$1,856.25'), 'deposit amount shown in review');

  button('Place order').click();
  await wait(1400);

  const path = window.location.pathname;
  assert(/^\/order\/7H-\d{4}-[A-Z0-9]{4}$/.test(path), `navigated to success screen (${path})`);
  assert(text().includes('in the queue') || text().includes('Order received'), 'success screen rendered');
  assert(text().includes('Deposit instructions'), 'deposit instructions rendered');
  assert(text().includes('Management alerts'), 'notification fan-out rendered');

  // Admin console picks the order up
  const login = await fetchImpl(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ passcode: '7HADMIN' }),
  }).then((response) => response.json());

  const overview = await fetchImpl(`${BASE}/api/admin/overview`, {
    headers: { 'x-admin-token': login.token },
  }).then((response) => response.json());

  const created = overview.orders.find((order) => `/order/${order.id}` === path);
  assert(Boolean(created), 'order appears in the admin overview');
  assert(created?.quote.total === 3712.5, `server quote matches client quote ($${created?.quote.total})`);
  assert(created?.files.audioLink.includes('drive.google.com'), 'master link stored');
  assert(
    overview.events.some((event) => event.orderId === created?.id && event.channel === 'slack'),
    'slack webhook event emitted',
  );

  // cleanup
  await fetchImpl(`${BASE}/api/admin/reset-demo`, { method: 'POST', headers: { 'x-admin-token': login.token } });
} catch (error) {
  checks.push({ ok: false, message: `crashed: ${error.message}` });
  console.error('✗ flow crashed:', error.message);
} finally {
  await vite.close();
  dom.window.close();
}

if (errors.length > 0) {
  console.log('\nConsole errors:');
  errors.slice(0, 5).forEach((error) => console.log(' -', error.slice(0, 300)));
}

const failed = checks.filter((check) => !check.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed > 0 || errors.length > 0 ? 1 : 0);
