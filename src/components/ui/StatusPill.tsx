import { statusLabel, statusTone } from '../../lib/format';

const tones: Record<string, string> = {
  lime: 'border-lime/30 bg-lime/10 text-lime-soft',
  amber: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  sky: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
  red: 'border-red-400/30 bg-red-400/10 text-red-200',
  muted: 'border-white/15 bg-white/[0.05] text-muted',
};

export function StatusPill({ status, dot = true }: { status: string; dot?: boolean }) {
  const tone = tones[statusTone(status)] ?? tones.muted;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${tone}`}
    >
      {dot && (
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            tone.includes('lime')
              ? 'bg-lime'
              : tone.includes('amber')
                ? 'bg-amber-300'
                : tone.includes('sky')
                  ? 'bg-sky-300'
                  : tone.includes('red')
                    ? 'bg-red-300'
                    : 'bg-muted'
          }`}
        />
      )}
      {statusLabel(status)}
    </span>
  );
}
