import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { usd } from '../../lib/format';
import { useToast } from '../ui/Toast';
import { Icon } from '../ui/Icon';
import type { Order, PlantMargin, PlantSheet } from '../../types';

/**
 * The plant desk.
 *
 * Two problems, one panel, because they are the same conversation.
 *
 * **Six forms, one spec.** Every plant takes orders differently — Mobineko's
 * configurator, GZ's FTP folders, Green Lakes' web form, Deepgrooves' calculator,
 * Seabass' configurator-or-email, Dr. Dub's shop. Retyping the same spec six times
 * is how a weight or a colour gets transposed. This panel builds the sheet for the
 * plant you picked, from the order you already have, and names the fields that
 * plant insists on and the portal cannot supply.
 *
 * **The number that decides the profit.** The client's price is fixed when they
 * accept the quote. The plant's invoice arrives later. Recording it here is the
 * moment the two meet, so a loss is visible before the order is placed instead of
 * when the invoice lands.
 */
export function PlantDesk({ order, plants }: { order: Order; plants: { id: string; name: string; moq: number }[] }) {
  const { notify } = useToast();
  const [plantId, setPlantId] = useState(order.plantPreference ?? plants[0]?.id ?? 'mobineko');
  const [sheet, setSheet] = useState<PlantSheet | null>(null);
  const [margin, setMargin] = useState<PlantMargin | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    costUsd: '',
    freightUsd: '',
    dutiesUsd: '',
    note: '',
    acknowledgeLoss: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.plantSheet(order.id, plantId);
      setSheet(result.sheet);
      setMargin(result.margin);
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Could not build the plant sheet.', 'error');
    } finally {
      setLoading(false);
    }
  }, [order.id, plantId, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  // Pre-fill the form from what was recorded last time, so editing does not mean
  // retyping the plant's own numbers.
  useEffect(() => {
    const recorded = order.plantQuote;
    setForm((prev) => ({
      ...prev,
      costUsd: recorded?.costUsd != null ? String(recorded.costUsd) : prev.costUsd,
      freightUsd: recorded?.freightUsd != null ? String(recorded.freightUsd) : prev.freightUsd,
      dutiesUsd: recorded?.dutiesUsd != null ? String(recorded.dutiesUsd) : prev.dutiesUsd,
      note: recorded?.note ?? prev.note,
      acknowledgeLoss: Boolean(recorded?.acknowledgedLoss),
    }));
  }, [order.plantQuote]);

  const ready = sheet?.ready ?? false;
  const blockers = sheet?.blockers ?? [];

  const save = async () => {
    setBusy(true);
    try {
      const result = await api.recordPlantQuote(order.id, {
        plantId,
        costUsd: Number(form.costUsd),
        freightUsd: Number(form.freightUsd || 0),
        dutiesUsd: Number(form.dutiesUsd || 0),
        note: form.note,
        acknowledgeLoss: form.acknowledgeLoss,
      });
      setMargin(result.margin);
      notify(result.margin.lossRisk ? 'Recorded — this order is running at a loss.' : 'Plant quote recorded.', result.margin.lossRisk ? 'error' : 'success');
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Could not record the plant quote.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const copySheet = async () => {
    if (!sheet) return;
    try {
      await navigator.clipboard.writeText(sheet.text);
      notify('Order sheet copied — paste it into the plant’s form or email.', 'success');
    } catch {
      notify('Copy failed — open the sheet and select it manually.', 'error');
    }
  };

  const tone = useMemo(() => {
    if (!margin || margin.status === 'unverified') return 'border-white/12 text-muted';
    if (margin.lossRisk) return 'border-red-400/40 bg-red-400/[0.06] text-red-200';
    return 'border-lime/30 bg-lime/[0.06] text-lime';
  }, [margin]);

  return (
    <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/20 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Plant desk</span>
        <div className="flex items-center gap-2">
          <select
            value={plantId}
            onChange={(event) => setPlantId(event.target.value)}
            className="rounded-md border border-white/12 bg-ink px-2 py-1 text-[11px] text-bone"
          >
            {plants.map((plant) => (
              <option key={plant.id} value={plant.id}>
                {plant.name} · MOQ {plant.moq}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void copySheet()}
            disabled={!sheet}
            className="flex items-center gap-1.5 rounded-full border border-lime/40 bg-lime/[0.08] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-lime disabled:opacity-40"
          >
            <Icon name="copy" size={11} />
            Copy sheet
          </button>
        </div>
      </div>

      {loading && !sheet && <p className="mt-2 text-[11px] text-muted">Building the sheet…</p>}

      {sheet && (
        <>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            <span className="text-bone">{sheet.plant.channel}</span> · {sheet.plant.portal} ·{' '}
            {sheet.files.length} file{sheet.files.length === 1 ? '' : 's'} attached
          </p>

          <ul className="mt-2 space-y-1">
            {sheet.fields
              .filter((entry) => entry.status !== 'ready' || entry.blocker)
              .slice(0, 8)
              .map((entry) => (
                <li key={entry.key} className="flex items-start gap-1.5 text-[10.5px] leading-relaxed">
                  <span
                    className={`mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full ${
                      entry.status === 'missing'
                        ? entry.blocker
                          ? 'bg-red-400'
                          : 'bg-amber-300'
                        : 'bg-lime'
                    }`}
                  />
                  <span className={entry.status === 'missing' && entry.blocker ? 'text-red-200' : 'text-muted'}>
                    <span className="text-bone/85">{entry.label}</span>
                    {entry.status === 'missing'
                      ? ' — missing'
                      : entry.status === 'assumed'
                        ? ' — assumed, confirm'
                        : ` — ${entry.value}`}
                  </span>
                </li>
              ))}
          </ul>

          {blockers.length > 0 && (
            <p className="mt-2 rounded-md border border-red-400/25 bg-red-400/[0.05] px-2 py-1.5 text-[10.5px] text-red-200">
              {sheet.plant.name} will not accept this order until {blockers.length} thing
              {blockers.length === 1 ? ' is' : 's are'} collected.
            </p>
          )}

          <div className={`mt-3 rounded-lg border px-2.5 py-2 text-[10.5px] leading-relaxed ${tone}`}>
            {margin ? margin.detail : 'Record what the plant actually quoted to check the margin.'}
          </div>

          <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
            <label className="block">
              <span className="text-[9.5px] uppercase tracking-[0.12em] text-muted">Plant cost USD</span>
              <input
                className="field mt-1 py-1.5 text-[11.5px]"
                inputMode="decimal"
                value={form.costUsd}
                onChange={(event) => setForm((prev) => ({ ...prev, costUsd: event.target.value }))}
                placeholder="2970.00"
              />
            </label>
            <label className="block">
              <span className="text-[9.5px] uppercase tracking-[0.12em] text-muted">Freight USD</span>
              <input
                className="field mt-1 py-1.5 text-[11.5px]"
                inputMode="decimal"
                value={form.freightUsd}
                onChange={(event) => setForm((prev) => ({ ...prev, freightUsd: event.target.value }))}
                placeholder="420.00"
              />
            </label>
            <label className="block">
              <span className="text-[9.5px] uppercase tracking-[0.12em] text-muted">Duties / clearance USD</span>
              <input
                className="field mt-1 py-1.5 text-[11.5px]"
                inputMode="decimal"
                value={form.dutiesUsd}
                onChange={(event) => setForm((prev) => ({ ...prev, dutiesUsd: event.target.value }))}
                placeholder="180.00"
              />
            </label>
          </div>

          <input
            className="field mt-2 py-1.5 text-[11.5px]"
            value={form.note}
            onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
            placeholder="Where the number came from — the plant's PDF quote, an email, a phone call"
          />

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || !form.costUsd}
              className="flex items-center gap-1.5 rounded-full bg-lime px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink disabled:opacity-40"
            >
              <Icon name={busy ? 'spinner' : 'check'} size={11} className={busy ? 'animate-spin' : ''} />
              Record plant quote
            </button>
            {margin?.lossRisk && (
              <label className="flex items-center gap-1.5 text-[10px] text-red-200">
                <input
                  type="checkbox"
                  checked={form.acknowledgeLoss}
                  onChange={(event) => setForm((prev) => ({ ...prev, acknowledgeLoss: event.target.checked }))}
                />
                I know this loses money — release it anyway
              </label>
            )}
            <span className={`ml-auto text-[10px] ${ready ? 'text-lime' : 'text-amber-200'}`}>
              {ready ? 'Sheet complete' : `${blockers.length || sheet.missing.length} to collect`}
            </span>
          </div>

          {margin && margin.status !== 'unverified' && (
            <p className="mt-1.5 text-[10px] text-muted">
              Client paid {usd(margin.revenueUsd, { cents: true })} · landed cost{' '}
              {usd(margin.landedCostUsd ?? 0, { cents: true })} · margin{' '}
              <span className={margin.lossRisk ? 'text-red-300' : 'text-lime'}>
                {usd(margin.marginUsd ?? 0, { cents: true })} ({margin.marginPct ?? 0}%)
              </span>
            </p>
          )}
        </>
      )}
    </div>
  );
}
