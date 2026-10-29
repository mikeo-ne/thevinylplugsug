import { useDraft } from '../../store/DraftContext';
import { usd } from '../../lib/format';
import { useRates } from '../../store/RatesContext';
import { Icon } from '../ui/Icon';
import { useConfig } from '../../hooks/useConfig';

export function OrderSummary({ onEdit }: { onEdit?: (step: number) => void }) {
  const { quote, client, files } = useDraft();
  const { note, rateLine } = useRates();
  const totalNote = note(quote.total, { ugx: quote.totals.total.ugx });
  const depositNote = note(quote.deposit, { ugx: quote.totals.deposit.ugx });

  const hasFiles = files.audio.length + files.artwork.length > 0;

  return (
    <aside className="panel overflow-hidden">
      <div className="border-b border-white/[0.07] px-5 py-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-bone">Order summary</h2>
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(1)}
              className="text-[11px] text-muted underline decoration-white/20 underline-offset-2 transition-colors hover:text-lime"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3 px-5 py-4 text-[12.5px]">
        <div className="flex items-start justify-between gap-3">
          <span className="text-muted">Format</span>
          <span className="text-right text-bone">
            {quote.vinylType.name}
            <span className="mt-0.5 block text-[11px] text-muted">{quote.vinylType.tagline}</span>
          </span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <span className="text-muted">Packaging</span>
          <span className="text-right text-bone">{quote.sleeve.name}</span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <span className="text-muted">Quantity</span>
          <span className="num text-bone">{quote.quantity} units</span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <span className="text-muted">Per record</span>
          <span className="num text-bone">{usd(quote.perUnit, { cents: true })}</span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <span className="text-muted">Plant</span>
          <span className="text-right text-bone">
            {quote.plant.name}
            <span className="mt-0.5 block text-[11px] text-muted">
              MOQ {quote.plant.moq} {quote.plant.moq === 1 ? 'unit' : 'units'} · {quote.plant.leadTime}
            </span>
          </span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <span className="text-muted">Delivery</span>
          <span className="max-w-[60%] text-right text-bone">
            {client.deliveryCity
              ? `${client.deliveryCity}${client.country ? `, ${client.country}` : ''}`
              : 'Not set yet'}
            <span className="mt-0.5 block text-[11px] text-muted">
              {client.deliveryType === 'international' ? 'Tour-city delivery' : 'Kampala delivery'}
            </span>
          </span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <span className="text-muted">Files</span>
          <span className={`text-right ${hasFiles ? 'text-lime' : 'text-muted'}`}>
            {hasFiles
              ? `${files.audio.length} audio · ${files.artwork.length} artwork`
              : 'Pending upload'}
          </span>
        </div>
      </div>

      <div className="border-t border-white/[0.07] px-5 py-4">
        <dl className="space-y-2 text-[12.5px]">
          <div className="flex justify-between">
            <dt className="text-muted">Factory cost</dt>
            <dd className="num text-bone/85">{usd(quote.factoryCost, { cents: true })}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Management fee · 25%</dt>
            <dd className="num text-bone/85">{usd(quote.managementFee, { cents: true })}</dd>
          </div>
        </dl>

        <div className="mt-3.5 flex items-end justify-between border-t border-white/[0.07] pt-3.5">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Turnkey total</div>
            <div className="num mt-1 text-[22px] font-semibold leading-none text-bone">
              {usd(quote.total, { cents: true })}
            </div>
            {totalNote && <div className="mt-1 text-[10.5px] text-muted">{totalNote}</div>}
          </div>
        </div>

        <div className="mt-3.5 rounded-lg border border-lime/25 bg-lime/[0.07] px-3.5 py-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-lime">
              Deposit today · 50%
            </span>
            <Icon name="lock" size={13} className="text-lime/70" />
          </div>
          <div className="num mt-1.5 text-[18px] font-semibold leading-none text-bone">
            {usd(quote.deposit, { cents: true })}
          </div>
          {depositNote && <div className="mt-1 text-[10.5px] text-muted">{depositNote}</div>}
        </div>
      </div>

      <div className="border-t border-white/[0.07] bg-black/20 px-5 py-3.5">
        <p className="flex items-start gap-2 text-[10.5px] leading-relaxed text-muted">
          <Icon name="shield" size={12} className="mt-0.5 shrink-0 text-lime/70" />
          Freight to Kampala and customs brokerage included. Balance due on dispatch.
        </p>
      </div>
    </aside>
  );
}
