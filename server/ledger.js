/**
 * The payments ledger — one place that answers "what came in, what is still owed".
 *
 * Point 1 of the 1 November brief: *"lets find a way of organising these orders and
 * payments made."* The data was already there, scattered: deposit intents live
 * inside each order, a hand-recorded deposit lives on `payment`, and the shop has
 * its own payment status. Nothing answered the question across orders, so the desk
 * had to open them one at a time.
 *
 * This module flattens three different records into one row shape. It is
 * deliberately read-only and derived: no ledger table, no second source of truth
 * to drift. If an intent changes state, the ledger changes with it.
 *
 * Row states, and why they are not just "paid / unpaid":
 *
 *   collected            money is in and the desk (or auto-confirm) has said so
 *   collected_unconfirmed a wallet says it collected; nobody has confirmed it yet
 *   pending              a prompt is out and the wallet has not answered
 *   failed               the prompt was declined, expired or errored
 *   owed                 nothing has been paid and nothing is in flight
 */

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const methodName = (id) =>
  id === 'mtn_momo' ? 'MTN MoMo' : id === 'airtel_money' ? 'Airtel Money' : id === 'card_bank' ? 'Card / bank' : id ?? '—';

/**
 * Every payment event, newest first.
 *
 * `includeOwed` adds one row per unpaid order so the ledger can also be read as a
 * debtors list; a ledger that only lists money already received cannot tell you
 * who to chase.
 */
export function buildLedger(db, { includeOwed = true } = {}) {
  const rows = [];

  for (const order of db.orders ?? []) {
    const payment = order.payment ?? {};
    const intents = [...(payment.intents ?? [])];
    const deposit = Number(order.quote?.deposit ?? 0);
    const paid = ['deposit_paid', 'paid'].includes(payment.status);

    for (const intent of intents) {
      const confirmed = Boolean(intent.confirmedDeposit) || (paid && intent.status === 'successful');
      const status =
        intent.status === 'successful'
          ? confirmed
            ? 'collected'
            : 'collected_unconfirmed'
          : intent.status === 'pending'
            ? 'pending'
            : 'failed';
      rows.push({
        id: `pay_${order.id}_${intent.id}`,
        kind: 'pressing',
        orderId: order.id,
        at: intent.settledAt ?? intent.requestedAt ?? order.createdAt,
        client: order.client?.name ?? '—',
        contact: order.client?.phone ?? order.client?.email ?? null,
        method: intent.provider ?? payment.method,
        methodName: methodName(intent.provider ?? payment.method),
        reference: intent.referenceId ?? null,
        amountUsd: intent.paidUgx
          ? round2(intent.paidUgx / (Number(order.quote?.fxRate) || 1))
          : round2(Number(intent.amountUsd ?? 0)),
        amountUgx: Number(intent.paidUgx ?? intent.amountUgx ?? 0),
        feeUgx: Number(intent.feeUgx ?? 0),
        status,
        confirmed,
        confirmedBy: confirmed ? (intent.confirmedBy ?? payment.confirmedBy ?? 'console') : null,
        note: intent.error ?? intent.message ?? null,
        depositUsd: deposit,
        orderStatus: order.status,
      });
    }

    // A deposit recorded by hand (bank transfer, cash at the desk) has no intent.
    if (paid && intents.length === 0) {
      rows.push({
        id: `pay_${order.id}_manual`,
        kind: 'pressing',
        orderId: order.id,
        at: payment.paidAt ?? order.createdAt,
        client: order.client?.name ?? '—',
        contact: order.client?.phone ?? order.client?.email ?? null,
        method: payment.method,
        methodName: methodName(payment.method),
        reference: payment.reference ?? null,
        amountUsd: round2(Number(payment.depositPaidUsd ?? deposit)),
        amountUgx: Math.round(Number(payment.depositPaidUsd ?? deposit) * (Number(order.quote?.fxRate) || 1)),
        feeUgx: 0,
        status: 'collected',
        confirmed: true,
        confirmedBy: payment.confirmedBy ?? 'console',
        note: payment.confirmationNote ?? 'Recorded by the desk',
        depositUsd: deposit,
        orderStatus: order.status,
      });
    }

    const inFlight = intents.some((intent) => intent.status === 'pending');
    if (includeOwed && !paid && !inFlight && order.status !== 'cancelled') {
      rows.push({
        id: `pay_${order.id}_owed`,
        kind: 'pressing',
        orderId: order.id,
        at: order.createdAt,
        client: order.client?.name ?? '—',
        contact: order.client?.phone ?? order.client?.email ?? null,
        method: payment.method,
        methodName: methodName(payment.method),
        reference: payment.reference ?? null,
        amountUsd: round2(deposit),
        amountUgx: Math.round(deposit * (Number(order.quote?.fxRate) || 1)),
        feeUgx: 0,
        status: 'owed',
        confirmed: false,
        confirmedBy: null,
        note: 'Deposit not paid yet',
        depositUsd: deposit,
        orderStatus: order.status,
      });
    }
  }

  // Retail: a fan's payment is its own pipeline, but it is still money.
  for (const order of db.shop?.orders ?? []) {
    if (order.status === 'cancelled') continue;
    const paid = order.payment?.status === 'paid';
    rows.push({
      id: `pay_${order.id}`,
      kind: 'shop',
      orderId: order.id,
      at: order.payment?.paidAt ?? order.createdAt,
      client: order.buyer?.name ?? '—',
      contact: order.buyer?.phone ?? order.buyer?.email ?? null,
      method: order.payment?.method ?? '—',
      methodName: methodName(order.payment?.method),
      reference: order.payment?.reference ?? null,
      amountUsd: round2(order.total ?? 0),
      amountUgx: Math.round(Number(order.totals?.total?.ugx ?? 0)),
      feeUgx: 0,
      status: paid ? 'collected' : 'owed',
      confirmed: paid,
      confirmedBy: paid ? 'shop' : null,
      note: `${order.records ?? 0} record(s)`,
      depositUsd: round2(order.total ?? 0),
      orderStatus: order.status,
    });
  }

  rows.sort((a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime());
  return rows;
}

/** Totals the desk actually asks for. */
export function ledgerTotals(rows) {
  const sum = (list, key) => round2(list.reduce((total, row) => total + Number(row[key] ?? 0), 0));
  const month = new Date().toISOString().slice(0, 7);
  const collected = rows.filter((row) => row.status === 'collected');
  const awaiting = rows.filter((row) => row.status === 'collected_unconfirmed');
  const pending = rows.filter((row) => row.status === 'pending');
  const owed = rows.filter((row) => row.status === 'owed');

  return {
    collectedUsd: sum(collected, 'amountUsd'),
    thisMonthUsd: sum(
      collected.filter((row) => String(row.at ?? '').slice(0, 7) === month),
      'amountUsd',
    ),
    awaitingUsd: sum(awaiting, 'amountUsd'),
    pendingUsd: sum(pending, 'amountUsd'),
    owedUsd: sum(owed, 'amountUsd'),
    counts: {
      collected: collected.length,
      collected_unconfirmed: awaiting.length,
      pending: pending.length,
      failed: rows.filter((row) => row.status === 'failed').length,
      owed: owed.length,
      pressing: rows.filter((row) => row.kind === 'pressing').length,
      shop: rows.filter((row) => row.kind === 'shop').length,
    },
  };
}

/** Filter by state, pipeline or date window. */
export function filterLedger(rows, { status, kind, from, to } = {}) {
  const fromTime = from ? new Date(from).getTime() : null;
  const toTime = to ? new Date(to).getTime() : null;
  return rows.filter((row) => {
    if (status && status !== 'all' && row.status !== status) return false;
    if (kind && kind !== 'all' && row.kind !== kind) return false;
    const at = new Date(row.at ?? 0).getTime();
    if (fromTime !== null && Number.isFinite(fromTime) && at < fromTime) return false;
    if (toTime !== null && Number.isFinite(toTime) && at > toTime) return false;
    return true;
  });
}

const csvCell = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The ledger as a spreadsheet — what an accountant asks for, not what a UI shows. */
export function ledgerCsv(rows) {
  const header = [
    'date',
    'pipeline',
    'order',
    'client',
    'contact',
    'method',
    'reference',
    'amount_usd',
    'amount_ugx',
    'wallet_fee_ugx',
    'state',
    'confirmed_by',
    'deposit_usd',
    'order_status',
    'note',
  ];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.at ? new Date(row.at).toISOString() : '',
        row.kind,
        row.orderId,
        row.client,
        row.contact,
        row.methodName,
        row.reference,
        row.amountUsd,
        row.amountUgx,
        row.feeUgx,
        row.status,
        row.confirmedBy,
        row.depositUsd,
        row.orderStatus,
        row.note,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}
