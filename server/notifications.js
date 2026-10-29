/**
 * Notification delivery.
 *
 * Every channel is env-gated: when credentials are present the alert is really
 * delivered (Slack webhook, Resend email, WhatsApp Cloud API, or a generic
 * JSON webhook). When they are absent the channel stays in simulation mode so
 * the product can be demoed without provisioning anything — and the console
 * says so explicitly rather than pretending an alert was sent.
 */
import { COMPANY, PAYMENT_METHODS } from './config.js';
import { describeConfiguration, PRESSING_PLANTS } from '../shared/pricing.js';

const REQUEST_TIMEOUT = 8000;

// Overridable so the test harness (and a corporate proxy) can point at a local
// sink instead of the real APIs.
const RESEND_URL = process.env.RESEND_BASE_URL ?? 'https://api.resend.com/emails';
const WHATSAPP_GRAPH_URL = process.env.WHATSAPP_GRAPH_URL ?? 'https://graph.facebook.com/v21.0';

export const notificationConfig = () => ({
  slack: Boolean(process.env.SLACK_WEBHOOK_URL),
  email: Boolean(process.env.RESEND_API_KEY),
  whatsapp: Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID),
  webhook: Boolean(process.env.NOTIFY_WEBHOOK_URL),
  plant: Boolean(process.env.PLANT_WEBHOOK_URL),
  plantEmail: Boolean(
    (process.env.PLANT_MOBINEKO_EMAIL || process.env.PLANT_GREENLAKES_EMAIL || process.env.PLANT_ORDERS_EMAIL) &&
      process.env.RESEND_API_KEY,
  ),
  emailTo: process.env.NOTIFY_EMAIL_TO ?? COMPANY.email,
  // Resend only accepts a sender on a domain you have verified. `onboarding@resend.dev`
  // works out of the box on their test tier (it can mail the account owner's address),
  // so a single RESEND_API_KEY is enough to receive real alerts. Set NOTIFY_EMAIL_FROM
  // to something on 7hmusicgroup.com once the domain is verified.
  emailFrom: process.env.NOTIFY_EMAIL_FROM ?? '7H Music Group <onboarding@resend.dev>',
  whatsappTo: process.env.NOTIFY_WHATSAPP_TO ?? COMPANY.whatsappNumber ?? null,
  // Outside a 24-hour customer window Meta only accepts pre-approved templates.
  // Default matches the sample template documented in DEPLOYMENT.md.
  whatsappTemplate: process.env.WHATSAPP_TEMPLATE_NAME ?? 'new_vinyl_order',
  whatsappLang: process.env.WHATSAPP_TEMPLATE_LANG ?? 'en_US',
  plantName:
    PRESSING_PLANTS.find((plant) => plant.id === process.env.PLANT_WEBHOOK_PLANT)?.name ?? 'Pressing plant',
});

/** True when this channel would perform a real network delivery. */
export function isChannelLive(channel) {
  const config = notificationConfig();
  if (channel === 'slack') return config.slack || config.webhook;
  if (channel === 'email') return config.email || config.webhook;
  if (channel === 'whatsapp') return config.whatsapp || config.webhook;
  if (channel === 'plant') return config.plant;
  return false;
}

export const channelMode = (channel) => (isChannelLive(channel) ? 'live' : 'simulated');

async function postJson(url, body, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text().catch(() => '');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}${text ? ` — ${text.slice(0, 180)}` : ''}`);
    }
    return { httpStatus: response.status, body: text };
  } finally {
    clearTimeout(timer);
  }
}

const paymentLabel = (methodId) =>
  PAYMENT_METHODS.find((method) => method.id === methodId)?.name ?? methodId;

const money = (value) => `$${Number(value ?? 0).toFixed(2)}`;

export function orderSummaryLine(order) {
  const config = describeConfiguration(order.configuration);
  return `${order.id} · ${order.client.name} · ${config.quantity} × ${config.vinyl} · ${money(order.quote.total)}`;
}

/** Plain-text + HTML order sheet used by every channel. */
export function buildOrderNotification(order) {
  const config = describeConfiguration(order.configuration);
  const plant =
    PRESSING_PLANTS.find((p) => p.id === order.plantPreference)?.name ?? 'Mobineko';
  const files = [...(order.files?.audio ?? []), ...(order.files?.artwork ?? [])];
  const linkLines = [
    order.files?.audioLink ? `Master link: ${order.files.audioLink}` : null,
    order.files?.artworkLink ? `Artwork link: ${order.files.artworkLink}` : null,
  ].filter(Boolean);

  const summary = orderSummaryLine(order);

  const text = [
    `7H MUSIC GROUP — NEW VINYL ORDER`,
    ``,
    `Order:      ${order.id}`,
    `Artist:     ${order.client.name}`,
    `Contact:    ${order.client.email} / ${order.client.phone}`,
    `Delivery:   ${order.client.deliveryCity}, ${order.client.country} (${order.client.deliveryType})`,
    `Address:    ${order.client.deliveryAddress}`,
    ``,
    `Format:     ${config.quantity} × ${config.vinyl}`,
    `Packaging:  ${config.sleeve}`,
    `Plant:      ${plant}`,
    `Turnaround: ${config.turnaround ?? '—'}`,
    ``,
    `Factory:    ${money(order.quote.factoryCost)}`,
    `7H fee:     ${money(order.quote.managementFee)}`,
    `Total:      ${money(order.quote.total)} (UGX ${order.quote.totals.total.ugx.toLocaleString('en-US')})`,
    `Deposit:    ${money(order.quote.deposit)} via ${paymentLabel(order.payment.method)} (${order.payment.status})`,
    ``,
    `Files:      ${files.length ? files.map((file) => file.originalName).join(', ') : 'pending upload'}`,
    ...linkLines,
    order.client.notes ? `Notes:      ${order.client.notes}` : null,
    ``,
    `Open console: ${process.env.PUBLIC_BASE_URL ?? 'https://thevinylplugsug.vercel.app'}/admin`,
  ]
    .filter((line) => line !== null)
    .join('\n');

  const row = (label, value) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#8a8a82;font-size:12px;white-space:nowrap">${label}</td><td style="padding:6px 0;color:#121212;font-size:13px;font-weight:500">${value}</td></tr>`;

  const html = `
  <div style="font-family:Inter,Helvetica,Arial,sans-serif;background:#f6f6f2;padding:24px">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e6e6df">
      <div style="background:#121212;padding:20px 24px">
        <div style="color:#CCFF00;font-size:11px;letter-spacing:2px;text-transform:uppercase">7H Music Group</div>
        <div style="color:#ffffff;font-size:19px;font-weight:600;margin-top:6px">New vinyl order — ${order.id}</div>
        <div style="color:#a8a8a0;font-size:12px;margin-top:4px">${summary.replace(order.id, '').replace(/^ · /, '')}</div>
      </div>
      <div style="padding:20px 24px">
        <table style="border-collapse:collapse;width:100%">
          ${row('Artist / Label', order.client.name)}
          ${row('Email', `<a href="mailto:${order.client.email}" style="color:#0a7a3d">${order.client.email}</a>`)}
          ${row('WhatsApp', `<a href="https://wa.me/${order.client.phone.replace(/[^0-9]/g, '')}" style="color:#0a7a3d">${order.client.phone}</a>`)}
          ${row('Deliver to', `${order.client.deliveryAddress}, ${order.client.deliveryCity}, ${order.client.country}`)}
          ${row('Format', `${config.quantity} × ${config.vinyl}`)}
          ${row('Packaging', config.sleeve)}
          ${row('Plant', plant)}
          ${row('Turnkey total', `<strong>${money(order.quote.total)}</strong> · UGX ${order.quote.totals.total.ugx.toLocaleString('en-US')}`)}
          ${row('Deposit', `${money(order.quote.deposit)} via ${paymentLabel(order.payment.method)}`)}
          ${row('Files', files.length ? files.map((file) => file.originalName).join('<br>') : 'Pending upload')}
          ${order.client.notes ? row('Notes', order.client.notes) : ''}
        </table>
        <a href="${process.env.PUBLIC_BASE_URL ?? 'https://thevinylplugsug.vercel.app'}/admin"
           style="display:inline-block;margin-top:18px;background:#CCFF00;color:#121212;text-decoration:none;padding:11px 20px;border-radius:999px;font-size:13px;font-weight:600">
          Open operations console
        </a>
      </div>
    </div>
  </div>`;

  return { summary, text, html };
}

function slackPayload(order) {
  const { summary, text } = buildOrderNotification(order);
  const config = describeConfiguration(order.configuration);
  return {
    text: `New vinyl order ${summary}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `New vinyl order · ${order.id}` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Artist*\n${order.client.name}` },
          { type: 'mrkdwn', text: `*Total*\n${money(order.quote.total)}` },
          { type: 'mrkdwn', text: `*Format*\n${config.quantity} × ${config.vinyl}` },
          { type: 'mrkdwn', text: `*Packaging*\n${config.sleeve}` },
          { type: 'mrkdwn', text: `*Deposit*\n${money(order.quote.deposit)}` },
          { type: 'mrkdwn', text: `*Delivery*\n${order.client.deliveryCity}, ${order.client.country}` },
        ],
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `${order.client.email} · ${order.client.phone}` },
        ],
      },
      { type: 'divider' },
      { type: 'section', text: { type: 'mrkdwn', text: '```' + text.slice(0, 2800) + '```' } },
    ],
  };
}

async function deliverSlack(order) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) throw new Error('SLACK_WEBHOOK_URL is not set');
  return postJson(url, slackPayload(order));
}

async function deliverEmail(order) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not set');
  const config = notificationConfig();
  const { summary, text, html } = buildOrderNotification(order);
  return postJson(
    RESEND_URL,
    {
      from: config.emailFrom,
      to: config.emailTo.split(',').map((address) => address.trim()).filter(Boolean),
      subject: `New vinyl order ${summary}`,
      text,
      html,
      reply_to: order.client.email,
    },
    { authorization: `Bearer ${apiKey}` },
  );
}

/**
 * WhatsApp delivery.
 *
 * Business-initiated messages outside a 24-hour customer window must be a
 * pre-approved template, so that is attempted first. If Meta rejects the
 * template (not approved yet, wrong name) the plain-text message is tried, which
 * succeeds inside an open window — e.g. right after management messaged the desk.
 * The error from the template attempt is preserved so the console can show it.
 */
async function deliverWhatsApp(order) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const config = notificationConfig();
  const to = config.whatsappTo;
  if (!token || !phoneId) throw new Error('WHATSAPP_TOKEN / WHATSAPP_PHONE_ID are not set');
  if (!to) throw new Error('NOTIFY_WHATSAPP_TO is not set');

  const headers = { authorization: `Bearer ${token}` };
  const url = `${WHATSAPP_GRAPH_URL}/${phoneId}/messages`;
  const recipient = to.replace(/[^0-9]/g, '');
  const { summary, text } = buildOrderNotification(order);
  const template = whatsappTemplatePayload(order, config);

  try {
    return await postJson(url, { ...template, to: recipient }, headers);
  } catch (templateError) {
    try {
      return await postJson(
        url,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipient,
          type: 'text',
          text: { preview_url: false, body: `${summary}\n\n${text.slice(0, 3200)}` },
        },
        headers,
      );
    } catch (textError) {
      throw new Error(
        `template "${config.whatsappTemplate}": ${templateError.message}; text fallback: ${textError.message}`,
      );
    }
  }
}

/**
 * The template message body. Parameters map 1:1 onto the approved template —
 * see DEPLOYMENT.md → "WhatsApp template" for the exact sample text to submit.
 */
export function whatsappTemplatePayload(order, config = notificationConfig()) {
  const describe = describeConfiguration(order.configuration);
  return {
    messaging_product: 'whatsapp',
    type: 'template',
    template: {
      name: config.whatsappTemplate,
      language: { code: config.whatsappLang },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: order.id },
            { type: 'text', text: order.client.name },
            { type: 'text', text: `${describe.quantity} × ${describe.vinyl}` },
            { type: 'text', text: money(order.quote.total) },
            { type: 'text', text: money(order.quote.deposit) },
          ],
        },
      ],
    },
  };
}

/** The sample body to submit to Meta so the template matches these parameters. */
export function whatsappTemplateSample() {
  return {
    name: notificationConfig().whatsappTemplate,
    language: notificationConfig().whatsappLang,
    category: 'UTILITY',
    body: [
      'New 7H vinyl order {{1}}',
      'Artist: {{2}}',
      'Spec: {{3}}',
      'Turnkey total: {{4}}',
      'Deposit due: {{5}}',
      'Open the operations console to confirm the deposit and release the plant order.',
    ].join('\n'),
    parameters: 5,
  };
}

async function deliverGenericWebhook(order, channel) {
  const url = process.env.NOTIFY_WEBHOOK_URL;
  if (!url) throw new Error('NOTIFY_WEBHOOK_URL is not set');
  return postJson(url, {
    event: 'order.created',
    channel,
    summary: orderSummaryLine(order),
    order: {
      id: order.id,
      createdAt: order.createdAt,
      client: order.client,
      configuration: order.configuration,
      quote: order.quote,
      payment: order.payment,
      files: order.files,
      plant: order.plantPreference,
    },
  });
}

/**
 * Deliver a single alert for an order. Returns the fields to merge onto the
 * stored event record. Never throws.
 */
export async function deliverNotification(channel, order) {
  const config = notificationConfig();

  try {
    let result;
    if (channel === 'slack' && config.slack) result = await deliverSlack(order);
    else if (channel === 'email' && config.email) result = await deliverEmail(order);
    else if (channel === 'whatsapp' && config.whatsapp) result = await deliverWhatsApp(order);
    else if (config.webhook) result = await deliverGenericWebhook(order, channel);
    else return { status: 'simulated', mode: 'simulated', error: null };

    return {
      status: 'delivered',
      mode: 'live',
      httpStatus: result.httpStatus,
      error: null,
      deliveredAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'Request timed out' : error.message;
    return { status: 'failed', mode: 'live', httpStatus: null, error: message };
  }
}

/**
 * Email the production request to the pressing plant.
 *
 * This is the automated hand-off: no one has to retype an order into the plant's
 * inbox. Requires RESEND_API_KEY and the plant's order address
 * (`PLANT_MOBINEKO_EMAIL` / `PLANT_GREENLAKES_EMAIL`, or `PLANT_ORDERS_EMAIL` as a
 * catch-all). File links are absolute so the plant can download masters directly.
 */
export async function emailPlantOrder(order, plant, plantId) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = plant?.ordersEmail || process.env.PLANT_ORDERS_EMAIL || null;
  if (!apiKey) return { status: 'simulated', mode: 'simulated', error: 'RESEND_API_KEY is not set' };
  if (!to) {
    return {
      status: 'simulated',
      mode: 'simulated',
      error: `No order address for ${plant?.name ?? plantId} — set PLANT_MOBINEKO_EMAIL / PLANT_GREENLAKES_EMAIL`,
    };
  }

  const base = (process.env.PUBLIC_BASE_URL ?? 'https://thevinylplugsug.vercel.app').replace(/\/$/, '');
  const payload = order.plantPayload ?? null;
  const files = [...(order.files?.audio ?? []), ...(order.files?.artwork ?? [])];
  const describe = describeConfiguration(order.configuration);
  const config = notificationConfig();

  const text = [
    `PRODUCTION REQUEST — ${order.id}`,
    ``,
    plantPayloadTextOf(order),
    ``,
    `Downloads (valid for this order):`,
    ...files.map((file) => `  ${file.kind.toUpperCase()}: ${base}/api/files/${file.id}/download`),
    order.files?.audioLink ? `  Master link: ${order.files.audioLink}` : null,
    order.files?.artworkLink ? `  Artwork link: ${order.files.artworkLink}` : null,
    ``,
    `Reply to: ${COMPANY.email}`,
  ]
    .filter((line) => line !== null)
    .join('\n');

  const rows = [
    ['Order', order.id],
    ['Artist / Label', order.client.name],
    ['Format', `${describe.quantity} × ${describe.vinyl}`],
    ['Packaging', describe.sleeve],
    ['Turnaround', describe.turnaround ?? '—'],
    ['Deliver to', `${order.client.deliveryAddress}, ${order.client.deliveryCity}, ${order.client.country}`],
    ['Deposit', `${money(order.quote.deposit)} · ${paymentLabel(order.payment.method)} · ${order.payment.status}`],
    ['Notes', order.client.notes || '—'],
  ]
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#8a8a82;font-size:12px;white-space:nowrap">${label}</td><td style="padding:6px 0;color:#121212;font-size:13px">${value}</td></tr>`,
    )
    .join('');

  const links = files
    .map(
      (file) =>
        `<li style="margin:4px 0"><a href="${base}/api/files/${file.id}/download" style="color:#0a7a3d">${file.originalName}</a> <span style="color:#8a8a82">(${file.kind})</span></li>`,
    )
    .join('');

  const html = `
  <div style="font-family:Inter,Helvetica,Arial,sans-serif;background:#f6f6f2;padding:24px">
    <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e6e6df">
      <div style="background:#121212;padding:20px 24px">
        <div style="color:#CCFF00;font-size:11px;letter-spacing:2px;text-transform:uppercase">Production request</div>
        <div style="color:#fff;font-size:19px;font-weight:600;margin-top:6px">${order.id} — ${order.client.name}</div>
        <div style="color:#a8a8a0;font-size:12px;margin-top:4px">Issued by 7H Music Group on deposit confirmation</div>
      </div>
      <div style="padding:20px 24px">
        <table style="border-collapse:collapse;width:100%">${rows}</table>
        <div style="margin-top:18px;font-size:13px;font-weight:600;color:#121212">Master &amp; artwork</div>
        <ul style="padding-left:18px;margin:8px 0 0;font-size:12.5px">${links || '<li>Pending upload</li>'}</ul>
        <p style="margin:18px 0 0;font-size:12px;color:#8a8a82">
          Quote the order number in all correspondence. Reply to ${COMPANY.email}.
        </p>
      </div>
    </div>
  </div>`;

  try {
    const result = await postJson(
      RESEND_URL,
      {
        from: config.emailFrom,
        to: [to],
        // Keep a copy on the desk inbox so a plant reply can never go unnoticed.
        bcc: config.emailTo.split(',').map((address) => address.trim()).filter(Boolean),
        subject: `Production request ${order.id} — ${order.client.name} — ${describe.quantity} × ${describe.vinyl}`,
        text,
        html,
        reply_to: COMPANY.email,
      },
      { authorization: `Bearer ${apiKey}` },
    );
    return {
      status: 'delivered',
      mode: 'live',
      httpStatus: result.httpStatus,
      error: null,
      deliveredAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'failed',
      mode: 'live',
      httpStatus: null,
      error: error?.name === 'AbortError' ? 'Request timed out' : error.message,
    };
  }
}

// Small indirection to avoid a circular import with webhooks.js.
let plantPayloadTextOf = (order) => `${order.id} — ${order.client.name}`;
export function attachPlantPayloadFormatter(formatter) {
  plantPayloadTextOf = formatter;
}

/** Push the plant payload to a configured plant endpoint (manual forward). */
export async function deliverPlantPayload(order, plantId) {
  const url = process.env.PLANT_WEBHOOK_URL;
  if (!url) return { status: 'simulated', mode: 'simulated', error: null };
  try {
    const result = await postJson(url, {
      event: 'order.forwarded',
      plant: plantId,
      payload: order.plantPayload,
      text: order.plantPayloadText,
    });
    return {
      status: 'delivered',
      mode: 'live',
      httpStatus: result.httpStatus,
      error: null,
      deliveredAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'failed',
      mode: 'live',
      httpStatus: null,
      error: error?.name === 'AbortError' ? 'Request timed out' : error.message,
    };
  }
}

/** Channel status for the admin console. */
export function channelStatus() {
  const config = notificationConfig();
  return [
    {
      channel: 'slack',
      live: config.slack || config.webhook,
      detail: config.slack ? 'Slack incoming webhook' : config.webhook ? 'Generic webhook' : 'Not configured',
    },
    {
      channel: 'email',
      live: config.email || config.webhook,
      detail: config.email ? `Resend → ${config.emailTo}` : config.webhook ? 'Generic webhook' : 'Not configured',
    },
    {
      channel: 'whatsapp',
      live: config.whatsapp || config.webhook,
      detail: config.whatsapp
        ? `WhatsApp Cloud API → ${config.whatsappTo ?? 'recipient missing'}`
        : config.webhook
          ? 'Generic webhook'
          : 'Not configured',
    },
    {
      channel: 'plant',
      live: config.plantEmail || config.plant,
      detail: config.plantEmail
        ? `Auto-email → ${config.plantEmail}`
        : config.plant
          ? 'Plant endpoint wired'
          : 'No plant order address yet',
    },
  ];
}
