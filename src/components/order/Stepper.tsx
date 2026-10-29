import { Icon } from '../ui/Icon';

export const ORDER_STEPS = [
  { id: 1, label: 'Client details', short: 'Details' },
  { id: 2, label: 'Masters & artwork', short: 'Files' },
  { id: 3, label: 'Payment', short: 'Payment' },
  { id: 4, label: 'Review & checkout', short: 'Review' },
];

interface StepperProps {
  current: number;
  completed: number;
  onSelect: (step: number) => void;
}

export function Stepper({ current, completed, onSelect }: StepperProps) {
  return (
    <div className="mb-8">
      <ol className="flex items-center gap-1.5 sm:gap-3">
        {ORDER_STEPS.map((step, index) => {
          const done = step.id <= completed && step.id !== current;
          const active = step.id === current;
          const reachable = step.id <= completed;
          return (
            <li key={step.id} className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-3">
              <button
                type="button"
                onClick={() => reachable && onSelect(step.id)}
                disabled={!reachable}
                aria-current={active ? 'step' : undefined}
                className={`group flex min-w-0 flex-1 items-center justify-center gap-2 rounded-full border px-1.5 py-2 text-left transition-all duration-300 min-[400px]:justify-start min-[400px]:gap-2.5 min-[400px]:px-2.5 sm:px-3.5 ${
                  active
                    ? 'border-lime/50 bg-lime/[0.08]'
                    : done
                      ? 'border-white/10 bg-white/[0.03] hover:border-lime/30'
                      : 'border-white/[0.07] bg-transparent'
                } ${reachable ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
              >
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold transition-colors ${
                    active
                      ? 'bg-lime text-ink'
                      : done
                        ? 'bg-lime/20 text-lime'
                        : 'bg-white/[0.06] text-muted'
                  }`}
                >
                  {done ? <Icon name="check" size={11} strokeWidth={3} /> : step.id}
                </span>
                <span
                  className={`hidden truncate text-[12px] font-medium sm:block ${
                    active ? 'text-bone' : done ? 'text-bone/70' : 'text-muted'
                  }`}
                >
                  {step.label}
                </span>
                <span
                  className={`hidden truncate text-[11px] font-medium min-[400px]:block sm:hidden ${
                    active ? 'text-bone' : 'text-muted'
                  }`}
                >
                  {step.short}
                </span>
              </button>
              {index < ORDER_STEPS.length - 1 && (
                <span className="hidden h-px w-4 shrink-0 bg-white/10 sm:block" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
      <div className="mt-3 h-0.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-lime transition-all duration-500 ease-out"
          style={{ width: `${(completed / ORDER_STEPS.length) * 100}%` }}
        />
      </div>
    </div>
  );
}
