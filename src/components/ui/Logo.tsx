import { Link } from 'react-router-dom';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="group inline-flex items-center gap-3" aria-label="7H Music Group — home">
      <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/15 bg-ink">
        <span className="absolute inset-0 rounded-full bg-lime/10 blur-[7px] transition-opacity duration-500 group-hover:opacity-100 opacity-0" />
        <svg viewBox="0 0 40 40" className="h-[26px] w-[26px]" aria-hidden="true">
          <circle cx="20" cy="20" r="15.5" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
          <circle cx="20" cy="20" r="11.5" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="0.8" />
          <circle cx="20" cy="20" r="7" fill="#CCFF00" />
          <circle cx="20" cy="20" r="2" fill="#121212" />
        </svg>
      </span>
      <span className="leading-none">
        <span className="block font-display text-[17px] font-semibold tracking-tight text-bone">
          7H<span className="text-lime">.</span>
        </span>
        {!compact && (
          <span className="mt-1 block text-[9px] font-medium uppercase tracking-[0.22em] text-muted">
            Music Group
          </span>
        )}
      </span>
    </Link>
  );
}
