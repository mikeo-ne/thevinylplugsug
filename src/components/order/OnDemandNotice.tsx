import { Icon } from '../ui/Icon';

/**
 * The "made fresh for you" notice.
 *
 * Every pressing order and shop parcel is manufactured after the order is paid,
 * shipped from the plant directly to the customer. Saying so on the summary
 * prevents the two questions the desk gets most: "why isn't it in stock?" and
 * "why is it coming from overseas?".
 */
export function OnDemandNotice({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-xl border border-lime/25 bg-lime/[0.06] p-3.5 ${className}`}>
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-lime/15 text-lime">
          <Icon name="factory" size={14} />
        </span>
        <div className="min-w-0">
          <div className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-lime">
            Custom On-Demand Manufacturing
          </div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
            Every order is pressed fresh and shipped directly from our international production facilities
            straight to your doorstep.
          </p>
        </div>
      </div>
    </div>
  );
}
