/**
 * Mobile money collections — making the "Pay to" block actually charge a phone.
 *
 * Until now the deposit step was paperwork: the console printed a merchant
 * number and a reference, the client dialled *165*3# by hand, and management
 * confirmed by eye. That works, but it cannot tell anyone whether the money
 * arrived, and a client who mistypes the reference has to be chased by hand.
 *
 * This module initiates a real collection request on the payer's wallet:
 *
 *   MTN MoMo    POST /collection/v1_0/requesttopay            (Collections API)
 *   Airtel      POST /merchant/v1/payments/                   (Collections API)
 *
 * The payer approves a prompt on their handset; the provider answers with a
 * reference we can poll, and a SUCCESSFUL answer is the only thing that can mark
 * the deposit as received.
 *
 * Two rules this module will not break:
 *
 *   1. **The deposit gate still lives in the console.** A provider saying
 *      SUCCESSFUL records what actually arrived; it does not by itself put an
 *      order in front of a pressing plant. Auto-confirmation is opt-in
 *      (`MOMO_AUTO_CONFIRM=true`) and even then requires the collected amount to
 *      cover the full 50% deposit.
 *   2. **No credentials, no pretending.** With nothing configured, every call
 *      answers `status: 'unconfigured'` and names the variables to set — the same
 *      contract the alert rails use. A green tick is never painted over a rail
 *      that cannot take money.
 */

import crypto from 'node:crypto';

const REQUEST_TIMEOUT = 12_000;

// Overridable so the test harness can point at a local sink instead of the real
// APIs (same trick as TELEGRAM_API_BASE).
const momoBase = () => (process.env.MOMO_API_BASE ?? 'https://proxy.momoapi.mtn.com').replace(/\/$/, '');
const airtelBase = () => (process.env.AIRTEL_API_BASE ?? 'https://openapi.airtel.africa').replace(/\/$/, '');

/** Where a provider should send its result callback. */
export const momoCallbackUrl = (orderId) =>
  `${(process.env.PUBLIC_BASE_URL ?? 'https://thevinylplugsug.vercel.app').replace(/\/$/, '')}/api/payments/momo/callback/${encodeURIComponent(orderId)}`;

/* ------------------------------------------------------------------ *
 * Configuration
 * ------------------------------------------------------------------ */

const MOMO_KEYS = ['MOMO_SUBSCRIPTION_KEY', 'MOMO_API_USER', 'MOMO_API_KEY'];
const AIRTEL_KEYS = ['AIRTEL_CLIENT_ID', 'AIRTEL_CLIENT_SECRET'];

const present = (keys) => keys.every((key) => Boolean(process.env[key]));

export const momoConfigured = () => present(MOMO_KEYS);
export const airtelConfigured = () => present(AIRTEL_KEYS);

/** Which rails can take money right now, and exactly what each is missing. */
export function paymentsHealth() {
  const check = (provider, keys, environment) => {
    const missing = keys.filter((key) => !process.env[key]);
    return {
      provider,
      label: provider === 'mtn_momo' ? 'MTN MoMo Collections' : 'Airtel Money Collections',
      ready: missing.length === 0,
      environment,
      missing,
    };
  };
  return [
    check('mtn_momo', MOMO_KEYS, process.env.MOMO_TARGET_ENV ?? 'mtnuganda'),
    check('airtel_money', AIRTEL_KEYS, process.env.AIRTEL_ENVIRONMENT ?? 'production'),
  ];
}

const rails = () => Object.fromEntries(paymentsHealth().map((rail) => [rail.provider, rail]));

/**
 * What to say instead of "failed" when a wallet rail has no credentials.
 * Naming the variables is the whole point: "payment failed" sends you looking in
 * the wrong place when the real answer is "you have not added a subscription key".
 */
export function unconfiguredPaymentMessage(provider, missing = []) {
  const list = missing.join(', ');
  if (provider === 'airtel_money') {
    return missing.length
      ? `Airtel Money is not set up yet: ${list}. Until it is, clients pay by merchant number and management confirms by hand.`
      : 'Airtel Money is not set up yet.';
  }
  return missing.length
    ? `MTN MoMo is not set up yet: ${list}. Get them from momodeveloper.mtn.com → Collections → your subscription. Until then clients pay by merchant number.`
    : 'MTN MoMo is not set up yet.';
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

/** Uganda-first MSISDN normalisation: `0772 000 000` → `256772000000`. */
export function normaliseMsisdn(raw) {
  const digits = String(raw ?? '').replace(/[^\d+]/g, '');
  if (!digits) return null;
  let value = digits.replace(/^\+/, '');
  if (value.startsWith('00')) value = value.slice(2);
  // A local number: 0 + 9 digits (0772…) → 256 + the last 9.
  if (/^0\d{9}$/.test(value)) value = `256${value.slice(1)}`;
  if (!/^\d{10,15}$/.test(value)) return null;
  return value;
}

export const maskMsisdn = (value) => {
  const digits = String(value ?? '');
  if (digits.length < 6) return digits;
  return `${digits.slice(0, 5)}•••${digits.slice(-3)}`;
};

async function callJson(url, { method = 'GET', headers = {}, body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text().catch(() => '');
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!response.ok) {
      const detail =
        data?.message ?? data?.reason ?? data?.error_description ?? data?.error ?? text.slice(0, 180);
      throw new Error(`HTTP ${response.status}${detail ? ` — ${detail}` : ''}`);
    }
    return { httpStatus: response.status, data };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ *
 * MTN MoMo Collections
 * ------------------------------------------------------------------ */

async function mtnToken() {
  const basic = Buffer.from(`${process.env.MOMO_API_USER}:${process.env.MOMO_API_KEY}`).toString('base64');
  const { data } = await callJson(`${momoBase()}/collection/token/`, {
    method: 'POST',
    headers: { authorization: `Basic ${basic}`, 'Ocp-Apim-Subscription-Key': process.env.MOMO_SUBSCRIPTION_KEY },
  });
  if (!data?.access_token) throw new Error('MTN did not return an access token');
  return data.access_token;
}

async function mtnRequestToPay({ referenceId, amount, payer, externalId, note }) {
  const token = await mtnToken();
  await callJson(`${momoBase()}/collection/v1_0/requesttopay`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'X-Reference-Id': referenceId,
      'X-Target-Environment': process.env.MOMO_TARGET_ENV ?? 'mtnuganda',
      'Ocp-Apim-Subscription-Key': process.env.MOMO_SUBSCRIPTION_KEY,
      'X-Callback-Url': momoCallbackUrl(externalId),
    },
    body: {
      amount: String(amount),
      currency: process.env.MOMO_CURRENCY ?? 'UGX',
      externalId,
      payer: { partyIdType: 'MSISDN', partyId: payer },
      payerMessage: note.slice(0, 100),
      payeeNote: note.slice(0, 100),
    },
  });
  // MTN answers 202 with an empty body; the reference we generated is the handle.
  return { httpStatus: 202, referenceId };
}

async function mtnStatus(referenceId) {
  const token = await mtnToken();
  const { data } = await callJson(`${momoBase()}/collection/v1_0/requesttopay/${referenceId}`, {
    headers: {
      authorization: `Bearer ${token}`,
      'X-Target-Environment': process.env.MOMO_TARGET_ENV ?? 'mtnuganda',
      'Ocp-Apim-Subscription-Key': process.env.MOMO_SUBSCRIPTION_KEY,
    },
  });
  return {
    status: String(data?.status ?? 'PENDING').toUpperCase(),
    amount: data?.amount ?? null,
    currency: data?.currency ?? null,
    reason: data?.reason ?? null,
  };
}

/* ------------------------------------------------------------------ *
 * Airtel Money Collections
 * ------------------------------------------------------------------ */

let airtelCache = { token: null, expiresAt: 0 };

async function airtelToken() {
  if (airtelCache.token && airtelCache.expiresAt > Date.now()) return airtelCache.token;
  const { data } = await callJson(`${airtelBase()}/auth/oauth2/token`, {
    method: 'POST',
    body: {
      client_id: process.env.AIRTEL_CLIENT_ID,
      client_secret: process.env.AIRTEL_CLIENT_SECRET,
      grant_type: 'client_credentials',
    },
  });
  if (!data?.access_token) throw new Error('Airtel did not return an access token');
  airtelCache = { token: data.access_token, expiresAt: Date.now() + 55 * 60 * 1000 };
  return data.access_token;
}

const airtelHeaders = async () => ({
  authorization: `Bearer ${await airtelToken()}`,
  'X-Country': 'UG',
  'X-Currency': process.env.AIRTEL_CURRENCY ?? 'UGX',
});

async function airtelRequestToPay({ amount, payer, externalId, note }) {
  const { data } = await callJson(`${airtelBase()}/merchant/v1/payments/`, {
    method: 'POST',
    headers: await airtelHeaders(),
    body: {
      reference: externalId,
      subscriber: { country: 'UG', currency: process.env.AIRTEL_CURRENCY ?? 'UGX', msisdn: payer },
      transaction: {
        amount: Number(amount),
        country: 'UG',
        currency: process.env.AIRTEL_CURRENCY ?? 'UGX',
        id: externalId,
      },
      // Airtel rejects long notes; keep it to the desk name.
      ...(note ? { additional: { message: note.slice(0, 60) } } : {}),
    },
  });
  const id = data?.data?.transaction?.id ?? data?.transaction?.id ?? null;
  if (!id) throw new Error('Airtel accepted the request without returning a transaction id');
  return { httpStatus: 200, referenceId: String(id) };
}

async function airtelStatus(referenceId) {
  const { data } = await callJson(`${airtelBase()}/standard/v1/payments/${encodeURIComponent(referenceId)}`, {
    headers: await airtelHeaders(),
  });
  const raw = String(data?.data?.transaction?.status ?? data?.status ?? 'TIP').toUpperCase();
  // Airtel's vocabulary: TIP = pending, TS = successful, TF = failed.
  const status = raw === 'TS' ? 'SUCCESSFUL' : raw === 'TF' ? 'FAILED' : 'PENDING';
  return {
    status,
    amount: data?.data?.transaction?.amount ?? null,
    currency: data?.data?.transaction?.currency ?? null,
    reason: data?.status?.message ?? data?.data?.transaction?.airtel_money_id ?? null,
  };
}

/* ------------------------------------------------------------------ *
 * The rail the rest of the app calls
 * ------------------------------------------------------------------ */

/**
 * Ask a wallet to pay the deposit.
 *
 * Returns a plain result object rather than throwing on "not set up", because
 * the console needs to render the difference between "we cannot take mobile
 * money" and "MTN refused this payment".
 */
export async function requestDeposit({
  provider,
  amountUgx,
  payerPhone,
  orderId,
  depositDueUgx,
}) {
  const rail = rails()[provider];
  if (!rail) return { status: 'failed', error: `Unknown mobile money provider ${provider}` };

  const payer = normaliseMsisdn(payerPhone);
  if (!payer) {
    return {
      status: 'failed',
      error: 'That does not look like a Ugandan mobile money number. Use 0772 000 000 or +256 772 000 000.',
    };
  }
  if (!rail.ready) {
    return {
      status: 'unconfigured',
      missing: rail.missing,
      error: unconfiguredPaymentMessage(provider, rail.missing),
    };
  }

  const amount = Number(amountUgx);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { status: 'failed', error: 'Nothing to collect — the deposit amount is zero.' };
  }

  // A collection request is an amount the payer approves. Asking for less than
  // the deposit would leave the order short; asking for more is not our money.
  if (depositDueUgx && Math.abs(amount - depositDueUgx) > 1) {
    return {
      status: 'failed',
      error: `Refusing to collect UGX ${amount.toLocaleString()} against a deposit of UGX ${Number(depositDueUgx).toLocaleString()}.`,
    };
  }

  const referenceId = crypto.randomUUID();
  const externalId = orderId;
  const note = `7H Music Group deposit ${orderId}`;

  try {
    const result =
      provider === 'mtn_momo'
        ? await mtnRequestToPay({ referenceId, amount, payer, externalId, note })
        : await airtelRequestToPay({ amount, payer, externalId, note });

    return {
      status: 'pending',
      provider,
      referenceId: result.referenceId,
      httpStatus: result.httpStatus,
      amountUgx: amount,
      currency: process.env.MOMO_CURRENCY ?? 'UGX',
      payer,
      payerMasked: maskMsisdn(payer),
      environment: rail.environment,
      requestedAt: new Date().toISOString(),
      message:
        provider === 'mtn_momo'
          ? 'Approve the prompt on your phone. It expires in about 90 seconds.'
          : 'Approve the Airtel Money prompt on your phone.',
    };
  } catch (error) {
    return {
      status: 'failed',
      provider,
      error: error?.name === 'AbortError' ? 'The wallet provider timed out (12s).' : error.message,
    };
  }
}

/** Ask the provider what happened to a collection we started. */
export async function checkDeposit(provider, referenceId) {
  const rail = rails()[provider];
  if (!rail) return { status: 'failed', error: `Unknown mobile money provider ${provider}` };
  if (!rail.ready) {
    return {
      status: 'unconfigured',
      missing: rail.missing,
      error: unconfiguredPaymentMessage(provider, rail.missing),
    };
  }
  try {
    const result =
      provider === 'mtn_momo' ? await mtnStatus(referenceId) : await airtelStatus(referenceId);
    return {
      ...result,
      // PENDING / SUCCESSFUL / FAILED are the three states the console shows.
      status: result.status,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'failed',
      error: error?.name === 'AbortError' ? 'The wallet provider timed out (12s).' : error.message,
      checkedAt: new Date().toISOString(),
    };
  }
}

/* ------------------------------------------------------------------ *
 * Callback authentication
 * ------------------------------------------------------------------ */

/**
 * A provider callback cannot carry an admin token, so it carries a secret only
 * the provider and this server can compute — the same pattern as the Telegram
 * webhook. Derived from the subscription key / client secret, never stored.
 */
export function callbackSecret(provider) {
  const seed = provider === 'airtel_money' ? process.env.AIRTEL_CLIENT_SECRET : process.env.MOMO_SUBSCRIPTION_KEY;
  if (!seed) return null;
  return crypto
    .createHash('sha256')
    .update(`7h-payments::${provider}::${seed}`)
    .digest('hex')
    .slice(0, 40);
}

export function verifyCallbackSecret(provider, provided) {
  const expected = callbackSecret(provider);
  if (!expected || typeof provided !== 'string' || provided.length !== expected.length) return false;
  // Constant-time compare so a prober cannot learn the secret one byte at a time.
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

export const depositUgxFor = (order) => {
  const depositUsd = Number(order?.quote?.deposit ?? 0);
  const rate = Number(order?.quote?.fxRate ?? process.env.FX_UGX_PER_USD ?? 4360);
  return Math.ceil(depositUsd * rate);
};

/** The 0.5% wallet fee is the payer's; show it rather than surprise them. */
export const walletFeeUgx = (amountUgx) => Math.ceil(Number(amountUgx ?? 0) * 0.005);
