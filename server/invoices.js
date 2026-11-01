/**
 * Invoices — the document that was promised in three places and existed nowhere.
 *
 * The order page said "a pro-forma invoice with SWIFT details is issued", the
 * success screen said the same, and no invoice was ever generated. This module
 * is the missing half of the workflow in the 1 November brief:
 *
 *   order → invoice → WhatsApp hand-off → (gate) → plant order sheet
 *
 * Two rules shape everything here.
 *
 * **The number is permanent.** An invoice is assigned a number the first time the
 * order needs one and never renumbers. `ensureInvoice` is safe to call on every
 * request: it writes once, then reads. Documents that renumber themselves are how
 * bookkeeping stops adding up.
 *
 * **The client never sees a percentage fee.** The quote is an all-in price —
 * pressing, freight to Kampala and handling, one number. The margin stays on the
 * console (see `/api/admin/orders/:id/payload` and the order panel), because a
 * "management fee · 25%" line invites the client to ask why they do not simply
 * email the plant themselves. They are not buying the pressing; they are buying
 * everything around it.
 */
import { COMPANY, PAYMENT_METHODS } from './config.js';

const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const money = (usd) =>
  `$${Number(usd ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const shillings = (ugx) => `UGX ${Math.round(Number(ugx ?? 0)).toLocaleString('en-US')}`;

const day = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

const stamp = (iso) =>
  iso ? new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '—';

/* ------------------------------------------------------------------ *
 * Numbering
 * ------------------------------------------------------------------ */

const PREFIX = '7H-INV-';

/**
 * Allocate the next number from the order book.
 *
 * The counter lives in the store so it survives a restart, but it also looks at
 * every number already issued: if the counter is ever missing or behind (an old
 * database, a restored backup), the next number is still one nobody has used.
 */
export function nextInvoiceNumber(db) {
  const counters = (db.counters ??= {});
  const issued = (db.orders ?? [])
    .map((order) => order.invoice?.number)
    .filter((number) => typeof number === 'string' && number.startsWith(PREFIX))
    .map((number) => Number.parseInt(number.slice(PREFIX.length), 10))
    .filter((value) => Number.isFinite(value));

  const highest = issued.length > 0 ? Math.max(...issued) : 0;
  const current = Number.isFinite(counters.invoice) ? counters.invoice : 0;
  counters.invoice = Math.max(highest, current) + 1;
  return `${PREFIX}${String(counters.invoice).padStart(4, '0')}`;
}

/**
 * Give an order its invoice number, once.
 *
 * Returns the invoice record either way, so callers never have to branch between
 * "new" and "already had one". The caller is responsible for saving the store.
 */
export function ensureInvoice(order, db) {
  if (order.invoice?.number) return order.invoice;
  const number = nextInvoiceNumber(db);
  order.invoice = {
    number,
    issuedAt: order.createdAt ?? new Date().toISOString(),
    // A draft order (admin-created, not yet confirmed by the client) issues its
    // invoice when it becomes a real order, not before. Recorded so the document
    // can say which it is.
    provisional: order.status === 'draft',
  };
  return order.invoice;
}

/* ------------------------------------------------------------------ *
 * Money
 * ------------------------------------------------------------------ */

/** What the client owes, what they have paid, and what the wallet is waiting on. */
export function invoiceAmounts(order) {
  const quote = order.quote ?? {};
  const rate = Number(quote.fxRate ?? order.quote?.totals?.total?.ugx / (quote.total || 1)) || null;
  const total = Number(quote.total ?? 0);
  const deposit = Number(quote.deposit ?? total / 2);
  const balance = Math.max(0, Math.round((total - deposit) * 100) / 100);

  const intents = order.payment?.intents ?? [];
  const settledUnconfirmed = intents.filter(
    (intent) => intent.status === 'successful' && !intent.confirmedDeposit,
  );
  const pendingIntent = intents.find((intent) => intent.status === 'pending') ?? null;

  const confirmed = ['deposit_paid', 'paid'].includes(order.payment?.status ?? '');
  const paidUsd = confirmed ? Number(order.payment?.depositPaidUsd ?? deposit) : 0;
  const awaitingUsd = confirmed
    ? 0
    : settledUnconfirmed.reduce((sum, intent) => sum + Number(intent.paidUgx ?? 0), 0) / (rate || 1);

  return {
    total,
    deposit,
    balance,
    paidUsd: Math.round(paidUsd * 100) / 100,
    awaitingUsd: Math.round(awaitingUsd * 100) / 100,
    outstandingUsd: Math.max(0, Math.round((deposit - paidUsd) * 100) / 100),
    confirmed,
    settledUnconfirmed,
    pendingIntent,
    rate,
    ugx: (usd) => (rate ? Math.round(usd * rate) : null),
  };
}

/** The word that goes on the stamp. */
export function invoiceStatus(order) {
  const amounts = invoiceAmounts(order);
  if (amounts.confirmed) return order.payment?.status === 'paid' ? 'PAID' : 'DEPOSIT PAID';
  if (amounts.awaitingUsd > 0.5) return 'PAYMENT RECEIVED — AWAITING DESK CONFIRMATION';
  if (amounts.pendingIntent) return 'PAYMENT REQUESTED — AWAITING WALLET APPROVAL';
  return 'PAYMENT DUE';
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

const plantName = (order) =>
  order.quote?.plant?.name ??
  order.configuration?.plantId ??
  order.plantPreference ??
  'Pressing plant on our panel';

const fileRows = (order) => {
  const audio = (order.files?.audio ?? []).map(
    (file) => `
      <tr>
        <td>Master audio</td>
        <td>${esc(file.originalName ?? file.name ?? 'master')}</td>
        <td class="num">${file.size ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : '—'}</td>
        <td class="mono">${esc((file.sha256 ?? '').slice(0, 16)) || '—'}</td>
      </tr>`,
  );
  const artwork = (order.files?.artwork ?? []).map(
    (file) => `
      <tr>
        <td>Artwork</td>
        <td>${esc(file.originalName ?? file.name ?? 'artwork')}</td>
        <td class="num">${file.size ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : '—'}</td>
        <td class="mono">${esc((file.sha256 ?? '').slice(0, 16)) || '—'}</td>
      </tr>`,
  );
  const links = [
    order.files?.audioLink ? { kind: 'Master audio (link)', name: order.files.audioLink } : null,
    order.files?.artworkLink ? { kind: 'Artwork (link)', name: order.files.artworkLink } : null,
  ].filter(Boolean);

  const rows = [
    ...audio,
    ...artwork,
    ...links.map(
      (link) => `
      <tr>
        <td>${esc(link.kind)}</td>
        <td class="mono">${esc(link.name)}</td>
        <td class="num">—</td>
        <td class="mono">—</td>
      </tr>`,
    ),
  ];
  return (
    rows.join('') ||
    '<tr><td colspan="4" class="muted">Files are being collected — your production desk will attach them.</td></tr>'
  );
};

const ledgerRows = (order, amounts) => {
  const intents = [...(order.payment?.intents ?? [])].sort(
    (a, b) => new Date(a.requestedAt ?? 0).getTime() - new Date(b.requestedAt ?? 0).getTime(),
  );
  if (intents.length === 0 && amounts.paidUsd === 0) {
    return '<tr><td colspan="5" class="muted">No payment recorded yet.</td></tr>';
  }
  const rows = intents.map((intent) => {
    const state =
      intent.confirmedDeposit || ['deposit_paid', 'paid'].includes(order.payment?.status ?? '')
        ? 'confirmed'
        : intent.status === 'successful'
          ? 'received — awaiting confirmation'
          : intent.status;
    return `
      <tr>
        <td>${esc(day(intent.requestedAt))}</td>
        <td>${esc(intent.provider === 'airtel_money' ? 'Airtel Money' : 'MTN MoMo')}</td>
        <td class="mono">${esc(intent.referenceId ?? intent.id ?? '—')}</td>
        <td class="num">${intent.paidUgx ? shillings(intent.paidUgx) : shillings(intent.amountUgx)}</td>
        <td>${esc(state)}</td>
      </tr>`;
  });
  // A deposit recorded by hand (bank transfer, cash at the desk) has no intent.
  if (intents.length === 0 && amounts.paidUsd > 0) {
    rows.push(`
      <tr>
        <td>${esc(day(order.payment?.paidAt ?? order.createdAt))}</td>
        <td>Recorded by the desk</td>
        <td class="mono">${esc(order.payment?.reference ?? '—')}</td>
        <td class="num">${amounts.ugx(amounts.paidUsd) ? shillings(amounts.ugx(amounts.paidUsd)) : money(amounts.paidUsd)}</td>
        <td>confirmed</td>
      </tr>`);
  }
  return rows.join('');
};

/**
 * The invoice as a printable HTML page.
 *
 * Deliberately self-contained: inline styles, no fonts or scripts from a CDN, and
 * a print rule that drops the toolbar. A client can open the link on a phone,
 * print to PDF, or forward it — which is exactly what happens to it in WhatsApp.
 */
export function renderInvoiceHtml(order, invoice = order.invoice) {
  const amounts = invoiceAmounts(order);
  const status = invoiceStatus(order);
  const client = order.client ?? {};
  const spec = order.configuration ?? {};
  const phone = String(client.phone ?? '').trim();
  const unpaid = !amounts.confirmed;
  const merchant =
    PAYMENT_METHODS.find((method) => method.id === 'mtn_momo')?.accountNumber ?? '0768 261 003';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(invoice?.number ?? 'Invoice')} · ${esc(client.name ?? 'Order')} · 7H Music Group</title>
<meta name="robots" content="noindex, nofollow" />
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 40px 20px; background: #f4f4f2; color: #16161a;
    font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Helvetica, Arial, sans-serif;
  }
  .sheet { max-width: 780px; margin: 0 auto; background: #fff; border: 1px solid #e2e2de; box-shadow: 0 1px 2px rgba(0,0,0,.05); }
  .bar { display: flex; justify-content: space-between; gap: 24px; padding: 28px 32px; background: #111114; color: #f5f5f2; }
  .brand { font-size: 20px; font-weight: 700; letter-spacing: -0.01em; }
  .brand span { color: #b7f04a; }
  .tagline { margin-top: 4px; font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: #9a9aa2; }
  .head-right { text-align: right; }
  .doc { font-size: 11px; letter-spacing: .22em; text-transform: uppercase; color: #9a9aa2; }
  .number { font-size: 17px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .stamp { display: inline-block; margin-top: 8px; padding: 4px 10px; border: 1px solid #b7f04a; border-radius: 999px; font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: #b7f04a; }
  .stamp.due { border-color: #f0b429; color: #f0b429; }
  .stamp.wait { border-color: #8ab4f8; color: #8ab4f8; }
  section { padding: 22px 32px; border-top: 1px solid #ececea; }
  h2 { margin: 0 0 10px; font-size: 10px; letter-spacing: .18em; text-transform: uppercase; color: #6f6f78; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .cols div p { margin: 2px 0; }
  .muted { color: #6f6f78; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 7px 0; text-align: left; vertical-align: top; }
  thead th { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: #6f6f78; border-bottom: 1px solid #ececea; }
  tbody tr + tr td { border-top: 1px solid #f3f3f1; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; }
  .totals { margin-left: auto; width: 100%; max-width: 360px; }
  .totals tr td { padding: 6px 0; }
  .totals .grand td { padding-top: 12px; font-size: 17px; font-weight: 600; border-top: 1px solid #111114; }
  .totals .sub td { color: #6f6f78; font-size: 12.5px; }
  .pay { background: #f8f8f6; border: 1px solid #ececea; padding: 16px 18px; margin-top: 14px; }
  .pay strong { font-size: 13px; }
  .kv { font-variant-numeric: tabular-nums; }
  footer { padding: 20px 32px 28px; border-top: 1px solid #ececea; font-size: 11.5px; color: #6f6f78; }
  footer p { margin: 4px 0; }
  .toolbar { max-width: 780px; margin: 0 auto 14px; display: flex; justify-content: flex-end; gap: 8px; }
  .toolbar a, .toolbar button {
    font: inherit; font-size: 12px; padding: 9px 14px; border-radius: 8px; border: 1px solid #d6d6d1;
    background: #fff; color: #16161a; cursor: pointer; text-decoration: none;
  }
  .toolbar a.primary { background: #111114; border-color: #111114; color: #f5f5f2; }
  @media print {
    body { background: #fff; padding: 0; font-size: 12px; }
    .sheet { border: 0; box-shadow: none; max-width: none; }
    .toolbar { display: none; }
    section { page-break-inside: avoid; }
  }
  @media (max-width: 600px) {
    .bar { flex-direction: column; }
    .head-right { text-align: left; }
    .cols { grid-template-columns: 1fr; }
    section, .bar, footer { padding-left: 18px; padding-right: 18px; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button type="button" onclick="window.print()">Print / save as PDF</button>
    <a class="primary" href="${esc(whatsappInvoiceLink(order, invoice))}" target="_blank" rel="noreferrer">Send on WhatsApp</a>
  </div>

  <main class="sheet">
    <header class="bar">
      <div>
        <div class="brand">7H <span>Music Group</span></div>
        <div class="tagline">Vinyl production &amp; brokerage · Kampala</div>
        <div class="tagline" style="margin-top:6px;letter-spacing:.08em">TIN ${esc(COMPANY.tin ?? '—')}</div>
      </div>
      <div class="head-right">
        <div class="doc">Invoice</div>
        <div class="number">${esc(invoice?.number ?? '—')}</div>
        <div class="stamp ${unpaid ? 'due' : ''}">${esc(status)}</div>
      </div>
    </header>

    <section>
      <div class="cols">
        <div>
          <h2>Billed to</h2>
          <p><strong>${esc(client.name ?? 'Artist / label')}</strong></p>
          <p class="muted">${esc(client.email ?? '')}</p>
          <p class="muted">${esc(client.phone ?? '')}</p>
        </div>
        <div>
          <h2>Invoice details</h2>
          <p>Order reference <span class="kv"><strong>${esc(order.id ?? '—')}</strong></span></p>
          <p>Issued ${esc(day(invoice?.issuedAt))}</p>
          <p>Deposit due <span class="kv">${esc(money(amounts.deposit))}</span> (${esc(
            Math.round((amounts.deposit / (amounts.total || 1)) * 100),
          )}%)</p>
        </div>
      </div>
    </section>

    <section>
      <div class="cols">
        <div>
          <h2>Deliver to</h2>
          <p>${esc(client.recipientName ?? client.name ?? '—')}</p>
          <p class="muted">${esc(client.deliveryAddress ?? '')}</p>
          <p class="muted">${esc(
            [client.deliveryCity, client.deliveryRegion, client.country].filter(Boolean).join(', '),
          )}</p>
        </div>
        <div>
          <h2>Production</h2>
          <p>${esc(order.quote?.vinylType?.name ?? spec.vinylTypeId ?? 'Vinyl')} · ${esc(
            String(spec.quantity ?? ''),
          )} units</p>
          <p class="muted">${esc(order.quote?.sleeve?.name ?? spec.sleeveId ?? 'Standard jacket')}</p>
          <p class="muted">${esc(plantName(order))}${order.quote?.plant?.leadTime ? ` · ${esc(order.quote.plant.leadTime)}` : ''}</p>
        </div>
      </div>
    </section>

    <section>
      <h2>What you are paying for</h2>
      <table>
        <thead>
          <tr><th>Item</th><th class="num">Qty</th><th class="num">Amount</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>Turnkey vinyl production — all-in</strong>
              <div class="muted" style="font-size:12px">
                Pressing, mastering pre-flight, artwork preparation, plant management,
                freight to Kampala and customs handling.
              </div>
            </td>
            <td class="num">${esc(String(spec.quantity ?? ''))}</td>
            <td class="num">${esc(money(amounts.total))}</td>
          </tr>
        </tbody>
      </table>

      <table class="totals" style="margin-top:16px">
        <tr>
          <td>All-in total</td>
          <td class="num">${esc(money(amounts.total))}</td>
        </tr>
        ${
          amounts.rate
            ? `<tr class="sub"><td>In shillings at UGX ${esc(
                Math.round(amounts.rate).toLocaleString('en-US'),
              )} / USD</td><td class="num">${esc(
                shillings(amounts.total * amounts.rate),
              )}</td></tr>`
            : ''
        }
        <tr><td>Deposit due now (${esc(String(Math.round((amounts.deposit / (amounts.total || 1)) * 100)))}%)</td><td class="num">${esc(
          money(amounts.deposit),
        )}</td></tr>
        <tr><td>Paid to date</td><td class="num">${esc(money(amounts.paidUsd))}</td></tr>
        ${
          amounts.awaitingUsd > 0.5
            ? `<tr class="sub"><td>Received, awaiting desk confirmation</td><td class="num">${esc(
                money(amounts.awaitingUsd),
              )}</td></tr>`
            : ''
        }
        <tr class="grand"><td>${unpaid ? 'Still to pay' : 'Balance on dispatch'}</td><td class="num">${esc(
          money(unpaid ? amounts.outstandingUsd : amounts.balance),
        )}</td></tr>
      </table>

      ${
        unpaid
          ? `<div class="pay">
        <strong>How to pay the deposit</strong>
        <p style="margin:6px 0 0">
          <strong>MTN MoMo:</strong> dial <span class="mono">*165*3#</span> → Pay Merchant →
          <span class="mono">${esc(merchant)}</span>, reference <span class="mono">${esc(order.id ?? '')}</span>.<br />
          <strong>Bank / card:</strong> reply to your order email and we send SWIFT details and a card link.
        </p>
        <p class="muted" style="margin:8px 0 0">
          Your order goes to the pressing plant only after the deposit is confirmed by our desk —
          never on the strength of a request alone.
        </p>
      </div>`
          : ''
      }
    </section>

    <section>
      <h2>Payment history</h2>
      <table>
        <thead>
          <tr><th>Date</th><th>Rail</th><th>Provider reference</th><th class="num">Amount</th><th>State</th></tr>
        </thead>
        <tbody>
          ${ledgerRows(order, amounts)}
        </tbody>
      </table>
    </section>

    ${
      order.tracklist
        ? `<section>
      <h2>Tracklist</h2>
      <pre class="mono" style="margin:0;white-space:pre-wrap;font-size:12px;line-height:1.65">${esc(
        order.tracklist,
      )}</pre>
    </section>`
        : ''
    }

    <section>
      <h2>Files on this order</h2>
      <table>
        <thead>
          <tr><th>Kind</th><th>Name</th><th class="num">Size</th><th>Checksum</th></tr>
        </thead>
        <tbody>${fileRows(order)}</tbody>
      </table>
    </section>

    <footer>
      <p><strong>7H Music Group</strong> · TIN ${esc(COMPANY.tin ?? '—')} · ${esc(COMPANY.location ?? 'Kampala, Uganda')} · ${esc(
        COMPANY.email ?? '7hmusicgroupug@gmail.com',
      )} · ${esc(COMPANY.phone ?? '+256 768 261 003')}</p>
      <p>All-in price: production, freight to Kampala and handling are included. Balance is due on dispatch;
        nothing is pressed until the plant proof is approved in writing.</p>
      <p class="mono">${esc(invoice?.number ?? '')} · issued ${esc(stamp(invoice?.issuedAt))} · order ${esc(
        order.id ?? '',
      )}${phone ? ` · ${esc(phone)}` : ''}</p>
    </footer>
  </main>
</body>
</html>`;
}

/**
 * The WhatsApp hand-off for an invoice.
 *
 * `wa.me` needs no credentials and no template approval, so this works today —
 * unlike the Cloud API rail, which waits on a Meta business account.
 */
export function whatsappInvoiceLink(order, invoice = order.invoice) {
  const amounts = invoiceAmounts(order);
  const number = (COMPANY.whatsappNumber ?? '256768261003').replace(/[^0-9]/g, '');
  const lines = [
    `Hello 7H Music Group — payment on order ${order.id}.`,
    '',
    `Invoice: ${invoice?.number ?? '—'}`,
    `Order: ${order.id}`,
    `Artist / label: ${order.client?.name ?? '—'}`,
    `${order.quote?.vinylType?.name ?? 'Vinyl'} · ${order.configuration?.quantity ?? ''} units · ${
      order.quote?.sleeve?.name ?? ''
    }`,
    `All-in total: ${money(amounts.total)}`,
    `Deposit due: ${money(amounts.deposit)}`,
  ];
  if (amounts.paidUsd > 0) lines.push(`Paid to date: ${money(amounts.paidUsd)}`);
  lines.push('', 'I am attaching proof of payment.');
  return `https://wa.me/${number}?text=${encodeURIComponent(lines.join('\n'))}`;
}

/** Absolute URL for the invoice, used in messages and on the console. */
export function invoiceUrl(order, baseUrl = process.env.PUBLIC_BASE_URL ?? '') {
  const path = `/api/orders/${encodeURIComponent(order.id)}/invoice`;
  const base = String(baseUrl ?? '').replace(/\/$/, '');
  return base ? `${base}${path}` : path;
}
