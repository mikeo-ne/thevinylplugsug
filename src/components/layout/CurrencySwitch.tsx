import { useRates } from '../../store/RatesContext';
import { Icon } from '../ui/Icon';
import type { CurrencyCode } from '../../types';

const LABELS: Record<CurrencyCode, string> = {
  UGX: 'UGX',
  USD: 'USD',
  EUR: 'EUR',
  GBP: 'GBP',
};

/**
 * The currency switcher.
 *
 * It shows what it is following: a delivery address (locked), the live rate, or
 * the safety rate when the forex feed is unreachable. A price the customer
 * cannot explain is worse than no price at all, so the source is never hidden.
 */
export function CurrencySwitch({ compact = false }: { compact?: boolean }) {
  const { available, currency, locked, lock, setCurrency, source, snapshot, status } = useRates();

  const tooltip = locked
    ? `Priced in ${currency} for ${lock?.label ?? 'your delivery address'}`
    : source === 'safety'
      ? 'Live rates unavailable — quoting at the safety rate'
      : `${snapshot.provider ?? 'Live rates'} · updated ${new Date(snapshot.fetchedAt).toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
        })}`;

  if (locked) {
    return (
      <span
        title={tooltip}
        className={`inline-flex items-center gap-1.5 rounded-full border border-lime/30 bg-lime/[0.07] px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-lime ${
          compact ? '' : 'sm:text-[11px]'
        }`}
      >
        <Icon name="lock" size={11} />
        {LABELS[currency]}
      </span>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-full border border-white/10 bg-white/[0.03] p-0.5"
      title={tooltip}
      role="group"
      aria-label="Display currency"
    >
      {available.map((code) => {
        const active = code === currency;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setCurrency(code)}
            aria-pressed={active}
            className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors ${
              active ? 'bg-lime text-ink' : 'text-muted hover:text-bone'
            } ${compact ? '' : 'sm:text-[10.5px]'}`}
          >
            {LABELS[code]}
          </button>
        );
      })}
      <span
        aria-hidden
        className={`ml-0.5 grid h-1.5 w-1.5 place-items-center rounded-full ${
          status === 'error' || source === 'safety' ? 'bg-amber-400' : 'bg-lime'
        }`}
      />
    </div>
  );
}
