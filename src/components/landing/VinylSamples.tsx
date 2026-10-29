import { useDraft } from '../../store/DraftContext';
import { useConfig } from '../../hooks/useConfig';
import { usd } from '../../lib/format';
import { VinylMockup } from '../vinyl/VinylMockup';
import { Icon } from '../ui/Icon';
import { Reveal } from '../ui/Reveal';

/**
 * Sample pressings — rendered from the live catalogue, not stock photography and
 * not invented clients. Each card is a real spec, drawn the way the plant will
 * press it, and loading one writes straight into the configurator so the
 * client sees their own quote move.
 */
export function VinylSamples() {
  const { configuration, setConfiguration } = useDraft();
  const { config } = useConfig();

  const loadVinyl = (vinylTypeId: string) => {
    setConfiguration({ vinylTypeId });
    document.getElementById('configurator')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const loadSleeve = (sleeveId: string) => {
    setConfiguration({ sleeveId });
    document.getElementById('configurator')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section id="samples" className="relative scroll-mt-24 border-t border-white/[0.06] py-20 lg:py-24">
      <div className="container-x">
        <Reveal>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="eyebrow eyebrow-dot mb-4">Sample pressings</div>
              <h2 className="display max-w-xl text-balance text-[clamp(1.75rem,3.4vw,2.8rem)] font-semibold">
                This is what lands <span className="text-lime">in your hands</span>.
              </h2>
            </div>
            <p className="max-w-sm text-[13px] leading-relaxed text-muted">
              Drawn from our current catalogue — compound colour, jacket style and 12&Prime; vs 7&Prime;
              proportions are exactly as the plant presses them. Tap a sample to load it into your quote.
            </p>
          </div>
        </Reveal>

        {/* ---------------- vinyl ---------------- */}
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {config.vinylTypes.map((type, index) => {
            const active = configuration.vinylTypeId === type.id;
            const unit = type.unit[configuration.quantity];
            return (
              <Reveal key={type.id} delay={index * 80}>
                <button
                  type="button"
                  onClick={() => loadVinyl(type.id)}
                  aria-pressed={active}
                  className={`group relative flex h-full w-full flex-col overflow-hidden rounded-2xl border p-4 text-left transition-all duration-300 sm:p-5 ${
                    active
                      ? 'border-lime/60 bg-lime/[0.05]'
                      : 'border-white/[0.09] bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-lime/[0.08] blur-2xl" />

                  <div className="relative mb-3 flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-muted">
                      {type.badge ?? 'Sample'}
                    </span>
                    {active && (
                      <span className="flex items-center gap-1 rounded-full border border-lime/30 bg-lime/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-lime">
                        <Icon name="check" size={9} strokeWidth={3} />
                        In your quote
                      </span>
                    )}
                  </div>

                  <div className="relative mx-auto w-full max-w-[260px]">
                    <VinylMockup
                      vinylTypeId={type.id}
                      sleeveId={configuration.sleeveId}
                      className="aspect-[384/300] w-full transition-transform duration-500 group-hover:-translate-y-1"
                    />
                  </div>

                  <div className="mt-4 flex items-start justify-between gap-3 border-t border-white/[0.07] pt-3.5">
                    <div className="min-w-0">
                      <h3 className={`text-[13.5px] font-medium ${active ? 'text-lime' : 'text-bone'}`}>
                        {type.name}
                      </h3>
                      <p className="mt-0.5 text-[11px] leading-snug text-muted">
                        {type.tagline} · {type.turnaround}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="num text-[13px] font-medium text-bone">
                        {unit ? usd(unit, { cents: true }) : '—'}
                      </div>
                      <div className="text-[9.5px] uppercase tracking-[0.1em] text-muted">per unit</div>
                    </div>
                  </div>
                </button>
              </Reveal>
            );
          })}
        </div>

        {/* ---------------- packaging ---------------- */}
        <Reveal delay={60}>
          <div className="mt-8 flex items-baseline justify-between gap-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-bone">
              Packaging samples
            </h3>
            <span className="text-[11px] text-muted">Artwork must be CMYK · 3mm bleed</span>
          </div>
        </Reveal>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {config.sleeves.map((sleeve, index) => {
            const active = configuration.sleeveId === sleeve.id;
            return (
              <Reveal key={sleeve.id} delay={index * 70}>
                <button
                  type="button"
                  onClick={() => loadSleeve(sleeve.id)}
                  aria-pressed={active}
                  className={`group flex h-full w-full flex-col overflow-hidden rounded-2xl border p-4 text-left transition-all duration-300 ${
                    active
                      ? 'border-lime/60 bg-lime/[0.05]'
                      : 'border-white/[0.09] bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="mx-auto w-full max-w-[220px]">
                    <VinylMockup
                      vinylTypeId={configuration.vinylTypeId}
                      sleeveId={sleeve.id}
                      className="aspect-[384/300] w-full transition-transform duration-500 group-hover:-translate-y-1"
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/[0.07] pt-3">
                    <span className={`text-[12.5px] font-medium ${active ? 'text-lime' : 'text-bone'}`}>
                      {sleeve.name}
                    </span>
                    <span className="shrink-0 text-[10.5px] uppercase tracking-[0.1em] text-muted">
                      {sleeve.perUnit === 0 ? 'Included' : `+${usd(sleeve.perUnit, { cents: true })}/ea`}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-muted">{sleeve.description}</p>
                </button>
              </Reveal>
            );
          })}
        </div>

        <Reveal delay={120}>
          <div className="mt-8 flex flex-col gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-muted">
              <Icon name="info" size={13} className="mt-0.5 shrink-0 text-lime" />
              Renders are representative: exact Pantone match is confirmed on the physical proof before we
              press.
            </p>
            <a
              href="#configurator"
              className="flex shrink-0 items-center gap-1.5 text-[11.5px] font-medium text-lime transition-opacity hover:opacity-80"
            >
              See it in your quote
              <Icon name="arrow-right" size={13} />
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
