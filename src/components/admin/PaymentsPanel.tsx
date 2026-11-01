import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { dateTime, usd } from '../../lib/format';
import { useToast } from '../ui/Toast';
import { Icon } from '../ui/Icon';
import type { LedgerRow } from '../../types';

/**
 * The payments ledger.
 *
 * One table for every movement of money — wallet prompts that are still pending,
 * money a wallet collected but nobody confirmed, deposits recorded by hand, retail
 * sales, and the orders that simply owe a deposit. The point is that the desk can
 * answer "what came in this week and who do I chase" without opening a single
 * order.
 */

const STATE_LABEL: Record<string, { label: string; className: string }> = {
  collected: { label: 'collected', className: 'border-lime/30 bg-lime/[0.08] text-lime' },
  collected_unconfirmed: { label: 'received · unconfirmed', className: 'border-amber-400/30 bg-amber-400/[0.06] text-amber-200' },
  pending: { label: 'prompt out', className: 'border-sky-400/30 bg-sky-400/[0.06] text-sky-200' },
  failed: { label: 'failed', className: 'border-red-400/30 bg-red-400/[0.06] text-red-300' },
  owed: { label: 'owed', className: 'border-white/12 bg-white/[0.03] text-muted' },
};

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'collected', label: 'Collected' },
  { id: 'collected_unconfirmed', label: 'Unconfirmed' },
  { id: 'pending', label: 'In flight' },
  { id: 'owed', label: 'Owed' },
  { id: 'failed', label: 'Failed' },
];

export function PaymentsPanel() {
  const { notify } = useToast();
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [totals, setTotals] = useState<{
    collectedUsd: number;
    thisMonthUsd: number;
    awaitingUsd: number;
    pendingUsd: number;
    owedUsd: number;
    counts: Record<string, number>;
  } | null>(null);
  const [filter, setFilter] = useState('all');
  const [kind, setKind] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.payments({ status: filter, kind });
      setRows(result.rows);
      setTotals(result.totals);
      setError(null);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'Could not load the ledger.');
    } finally {
      setLoading(false);
    }
  }, [filter, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(
    () => [
      { label: 'Collected', value: usd(totals?.collectedUsd ?? 0, { cents: false }), hint: `${totals?.counts.collected ?? 0} payments` },
      { label: 'This month', value: usd(totals?.thisMonthUsd ?? 0, { cents: false }), hint: 'confirmed only' },
      { label: 'Awaiting confirm', value: usd(totals?.awaitingUsd ?? 0, { cents: false }), hint: `${totals?.counts.collected_unconfirmed ?? 0} in the console` },
      { label: 'In flight', value: usd(totals?.pendingUsd ?? 0, { cents: false }), hint: `${totals?.counts.pending ?? 0} prompts out` },
      { label: 'Owed', value: usd(totals?.owedUsd ?? 0, { cents: false }), hint: `${totals?.counts.owed ?? 0} orders` },
    ],
    [totals],
  );

  return (
    <section className="panel mt-5 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-lime/10 text-lime">
            <Icon name="bolt" size={12} />
          </span>
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bone">Payments</h2>
            <p className="text-[10px] text-muted">Every deposit, prompt and sale — one ledger</p>
          </div>
        </div>
        <a
          className="flex items-center gap-1.5 rounded-full border border-white/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted transition-colors hover:border-lime/40 hover:text-lime"
          href="/api/admin/payments.csv"
          onClick={() => notify('Downloading the ledger as CSV.', 'success')}
        >
          <Icon name="external" size={11} />
          CSV
        </a>
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-white/[0.07] px-4 py-3 sm:grid-cols-5">
        {summary.map((stat) => (
          <div key={stat.label}>
            <div className="text-[9px] uppercase tracking-[0.14em] text-muted">{stat.label}</div>
            <div className="num mt-0.5 text-[14px] font-semibold text-bone">{stat.value}</div>
            <div className="text-[9px] text-muted/80">{stat.hint}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5">
        {FILTERS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setFilter(entry.id)}
            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors ${
              filter === entry.id
                ? 'border-lime/40 bg-lime/[0.08] text-lime'
                : 'border-white/10 text-muted hover:text-bone'
            }`}
          >
            {entry.label}
          </button>
        ))}
        <span className="mx-1 h-3 w-px bg-white/10" />
        {[
          { id: 'all', label: 'Everything' },
          { id: 'pressing', label: 'Pressing' },
          { id: 'shop', label: 'Shop' },
        ].map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setKind(entry.id)}
            className={`rounded-full border px-2.5 py-1 text-[10px] transition-colors ${
              kind === entry.id ? 'border-white/25 text-bone' : 'border-white/10 text-muted hover:text-bone'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {error && <p className="px-4 pb-3 text-[11px] text-red-300">{error}</p>}
      {loading && rows.length === 0 && <p className="px-4 pb-3 text-[11px] text-muted">Loading the ledger…</p>}

      {rows.length > 0 && (
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="sticky top-0 bg-ink/95 text-[9px] uppercase tracking-[0.12em] text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-2 py-2 font-medium">Order</th>
                <th className="px-2 py-2 font-medium">Client</th>
                <th className="px-2 py-2 font-medium">Rail</th>
                <th className="px-2 py-2 text-right font-medium">Amount</th>
                <th className="px-4 py-2 font-medium">State</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const state = STATE_LABEL[row.status] ?? STATE_LABEL.owed;
                return (
                  <tr key={row.id} className="border-t border-white/[0.05] hover:bg-white/[0.02]">
                    <td className="whitespace-nowrap px-4 py-2 text-muted">{dateTime(row.at)}</td>
                    <td className="px-2 py-2">
                      <span className="font-mono text-[10.5px] text-lime/90">{row.orderId}</span>
                      <span className="ml-1.5 text-[9px] uppercase tracking-[0.1em] text-muted">{row.kind}</span>
                    </td>
                    <td className="max-w-[140px] truncate px-2 py-2 text-bone/85">{row.client}</td>
                    <td className="px-2 py-2">
                      <span className="text-muted">{row.methodName}</span>
                      {row.reference && (
                        <span className="ml-1 font-mono text-[9.5px] text-muted/70">{row.reference}</span>
                      )}
                    </td>
                    <td className="num px-2 py-2 text-right text-bone">
                      {usd(row.amountUsd, { cents: true })}
                      <span className="ml-1 block text-[9px] text-muted">
                        UGX {row.amountUgx.toLocaleString('en-US')}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${state.className}`}>
                        {state.label}
                      </span>
                      {row.confirmedBy && (
                        <span className="ml-1.5 text-[9px] text-muted">by {row.confirmedBy}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && rows.length === 0 && !error && (
        <p className="px-4 pb-4 text-[11px] text-muted">Nothing matches that filter.</p>
      )}
    </section>
  );
}
