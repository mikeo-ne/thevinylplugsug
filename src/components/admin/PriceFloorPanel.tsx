import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { usd } from '../../lib/format';
import { Icon } from '../ui/Icon';
import type { PriceReference, PriceReferenceRow } from '../../types';

/**
 * The price floor.
 *
 * The question that started this: "make an order on every plant and reference
 * those prices to our prices so that no losses are made, because there are some
 * add-on prices as you input order information". This panel is that answer —
 * every plant's own price for the same basket, landed in Kampala, next to what we
 * charge, at every run size.
 *
 * The rule the panel exists to prove: our price is above the dearest plant that
 * will take the run. If a row ever turns red, the rate card has drifted below a
 * plant and the console says so before a client does.
 */

const CONFIDENCE: Record<string, { label: string; className: string }> = {
  quoted: { label: 'their quote', className: 'border-lime/30 bg-lime/[0.08] text-lime' },
  modelled: { label: 'modelled', className: 'border-amber-400/30 bg-amber-400/[0.06] text-amber-200' },
  estimate: { label: 'estimate', className: 'border-sky-400/30 bg-sky-400/[0.06] text-sky-200' },
};

export function PriceFloorPanel() {
  const [data, setData] = useState<PriceReference | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.priceFloor());
      setError(null);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'Could not load the plant prices.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows: PriceReferenceRow[] = data?.rows ?? [];

  return (
    <section className="panel p-5" id="price-floor">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-bone">
            <Icon name="truck" className="h-4 w-4 text-lime" />
            Price floor
          </h2>
          <p className="mt-1 max-w-[62ch] text-[12px] leading-relaxed text-muted">
            Each plant&rsquo;s own price for 12&quot; LP, printed jacket and printed labels, plus freight,
            duty, VAT and clearance to Kampala — against what we charge. A run is only quoted above the
            dearest plant that will take it, so no order can be sold at a loss.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <span
              className={`chip ${
                data.clearsFloor
                  ? 'border-lime/30 bg-lime/[0.08] text-lime'
                  : 'border-red-400/40 bg-red-400/[0.08] text-red-300'
              }`}
            >
              {data.clearsFloor ? 'every run clears cost' : 'BELOW COST — fix the rate card'}
            </span>
          )}
          <button type="button" className="btn-ghost" onClick={() => void load()} disabled={loading}>
            <Icon name="refresh" className="h-3.5 w-3.5" />
            {loading ? 'Checking…' : 'Recheck'}
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-[12px] text-red-300">{error}</p>}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[12px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-muted">
              <th className="py-2 pr-3 font-medium">Run</th>
              <th className="py-2 pr-3 font-medium">We charge</th>
              <th className="py-2 pr-3 font-medium">Per record</th>
              <th className="py-2 pr-3 font-medium">Dearest landed</th>
              <th className="py-2 pr-3 font-medium">Headroom</th>
              <th className="py-2 font-medium">Covered plants</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const headroom = row.ourPriceUsd != null && row.bindingFloorUsd != null ? row.ourPriceUsd - row.bindingFloorUsd : null;
              const short = headroom != null && headroom < 0;
              return (
                <tr
                  key={row.quantity}
                  className={`cursor-pointer border-t border-white/[0.06] align-top hover:bg-white/[0.02] ${
                    short ? 'bg-red-400/[0.05]' : ''
                  }`}
                  onClick={() => setOpen(open === row.quantity ? null : row.quantity)}
                >
                  <td className="py-2.5 pr-3 num text-bone">{row.quantity.toLocaleString('en-US')}</td>
                  <td className="py-2.5 pr-3 num text-bone">{usd(row.ourPriceUsd ?? 0, { cents: true })}</td>
                  <td className="py-2.5 pr-3 num text-muted">{usd(row.ourPerUnitUsd ?? 0, { cents: true })}</td>
                  <td className="py-2.5 pr-3 num text-muted">{usd(row.bindingFloorUsd ?? 0, { cents: true })}</td>
                  <td className={`py-2.5 pr-3 num ${short ? 'text-red-300' : 'text-lime'}`}>
                    {headroom == null ? '—' : usd(headroom, { cents: true })}
                  </td>
                  <td className="py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {row.lines.map((line) => {
                        const confidence = CONFIDENCE[line.confidence] ?? CONFIDENCE.modelled;
                        return (
                          <span
                            key={line.plantId}
                            className={`chip ${line.clearsFloor ? confidence.className : 'border-red-400/40 text-red-300'}`}
                            title={`${line.plantName} — factory ${usd(line.factoryUsd, { cents: true })}, landed ${usd(
                              line.landedUsd,
                              { cents: true },
                            )}`}
                          >
                            {line.plantId} {usd(line.landedPerUnitUsd, { cents: true })}/ea
                          </span>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="py-4 text-muted">
                  No run sizes returned.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {open != null && (() => {
        const row = rows.find((entry) => entry.quantity === open);
        if (!row) return null;
        return (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted">
              {row.quantity.toLocaleString('en-US')} units — plant by plant
            </div>
            <table className="mt-2 w-full border-collapse text-[12px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.12em] text-muted">
                  <th className="py-1.5 pr-3 font-medium">Plant</th>
                  <th className="py-1.5 pr-3 font-medium">Their invoice</th>
                  <th className="py-1.5 pr-3 font-medium">Landed in Kampala</th>
                  <th className="py-1.5 pr-3 font-medium">Per record</th>
                  <th className="py-1.5 font-medium">We clear by</th>
                </tr>
              </thead>
              <tbody>
                {row.lines.map((line) => (
                  <tr key={line.plantId} className="border-t border-white/[0.06]">
                    <td className="py-1.5 pr-3 text-bone">
                      {line.plantName}
                      <span className="ml-2 text-[10px] uppercase tracking-[0.1em] text-muted">
                        {CONFIDENCE[line.confidence]?.label ?? line.confidence}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 num text-muted">{usd(line.factoryUsd, { cents: true })}</td>
                    <td className="py-1.5 pr-3 num text-muted">{usd(line.landedUsd, { cents: true })}</td>
                    <td className="py-1.5 pr-3 num text-muted">{usd(line.landedPerUnitUsd, { cents: true })}</td>
                    <td className={`py-1.5 num ${(line.coverUsd ?? 0) < 0 ? 'text-red-300' : 'text-lime'}`}>
                      {line.coverUsd == null ? '—' : usd(line.coverUsd, { cents: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}

      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        A <span className="text-lime">their quote</span> badge means the plant published the number and we
        read it. <span className="text-amber-200">modelled</span> means they quote only on request, so the
        price is held above the market until their written quote replaces it — deliberately high, because
        guessing low is how a run gets sold at a loss.
      </p>
    </section>
  );
}
