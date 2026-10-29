import { useDraft } from '../../store/DraftContext';
import { useConfig } from '../../hooks/useConfig';
import { usd } from '../../lib/format';
import { VinylMockup } from '../vinyl/VinylMockup';
import { SLEEVES } from '../vinyl/sleeveArt';
import { Icon } from '../ui/Icon';
import { Reveal } from '../ui/Reveal';

/** Which sleeve sits on which format in the shelf, so the grid reads like a run. */
const SHELF: { art: string; vinylTypeId: string; sleeveId: string }[] = [
  { art: 'nile-beat', vinylTypeId: 'lp_standard', sleeveId: 'standard' },
  { art: 'amaka', vinylTypeId: 'lp_colored', sleeveId: 'gatefold' },
  { art: 'ekitibwa', vinylTypeId: 'seven_single', sleeveId: 'standard' },
  { art: 'emizannyo', vinylTypeId: 'lp_standard', sleeveId: 'inner' },
  { art: 'nalubaale', vinylTypeId: 'lp_colored', sleeveId: 'standard' },
  { art: 'nsenene', vinylTypeId: 'seven_single', sleeveId: 'gatefold' },
];

/**
 * Sleeve artwork + catalogue. The shelf shows original designs in the classic
 * East African pressing idiom; each card also states the format and jacket it is
 * printed on, so it doubles as a "this is what you get" reference.
 */
export function VinylSamples() {
  const { configuration, setConfiguration } = useDraft();
  const { config } = useConfig();

  const load = (vinylTypeId: string, sleeveId: string) => {
    setConfiguration({ vinylTypeId, sleeveId });
    document.getElementById('configurator')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section id="samples" className="relative scroll-mt-24 border-t border-white/[0.06] py-16 sm:py-20 lg:py-24">
      <div className="container-x">
        <Reveal>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="eyebrow eyebrow-dot mb-4">Sample pressings</div>
              <h2 className="display max-w-xl text-balance text-[clamp(1.75rem,3.4vw,2.8rem)] font-semibold">
                Sleeves in the <span className="text-lime">classic Kampala idiom</span>.
              </h2>
            </div>
            <p className="max-w-sm text-[13px] leading-relaxed text-muted">
              Original artwork drawn for this catalogue — sunburst labels, cloth-print geometry, the
              ochre-and-oxide palettes of the 45 era. Print runs, compound colour and 12&Prime; vs
              7&Prime; proportions are exactly as the plant presses them.
            </p>
          </div>
        </Reveal>

        {/* ---------------- sleeve shelf ---------------- */}
        <div className="mt-8 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 sm:mt-10 lg:grid-cols-3">
          {SHELF.map((item, index) => {
            const design = SLEEVES.find((sleeve) => sleeve.id === item.art)!;
            const vinyl = config.vinylTypes.find((type) => type.id === item.vinylTypeId);
            const sleeve = config.sleeves.find((option) => option.id === item.sleeveId);
            return (
              <Reveal key={item.art} delay={index * 60}>
                <button
                  type="button"
                  onClick={() => load(item.vinylTypeId, item.sleeveId)}
                  className="group flex h-full w-full flex-col overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.02] p-3.5 text-left transition-all duration-300 hover:border-lime/40 hover:bg-white/[0.04] sm:p-4"
                >
                  <div className="relative w-full overflow-hidden rounded-xl bg-black/30">
                    <VinylMockup
                      vinylTypeId={item.vinylTypeId}
                      sleeveId={item.sleeveId}
                      art={item.art}
                      className="aspect-[384/300] w-full transition-transform duration-500 group-hover:scale-[1.02]"
                    />
                    <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.12em] text-bone/80 backdrop-blur-sm">
                      {vinyl?.shortName ?? '12"'} · {sleeve?.name ?? 'Jacket'}
                    </span>
                  </div>

                  <div className="mt-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-[13px] font-medium text-bone">{design.title}</h3>
                      <p className="truncate text-[11px] text-muted">{design.artist}</p>
                    </div>
                    <span className="shrink-0 text-right text-[9.5px] uppercase tracking-[0.1em] text-lime/80">
                      {design.era.split(' · ')[0]}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[10.5px] leading-snug text-muted/80">{design.note}</p>
                </button>
              </Reveal>
            );
          })}
        </div>

        <Reveal delay={80}>
          <div className="mt-5 flex flex-col gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted">
              <Icon name="info" size={12} className="mt-0.5 shrink-0 text-lime" />
              Original designs, drawn in-house — no third-party sleeve art is reproduced. Your own
              artwork replaces it at proof stage.
            </p>
            <a
              href="#configurator"
              className="flex shrink-0 items-center gap-1.5 text-[11.5px] font-medium text-lime transition-opacity hover:opacity-80"
            >
              Price one of these
              <Icon name="arrow-right" size={12} />
            </a>
          </div>
        </Reveal>

        {/* ---------------- what you can order ---------------- */}
        <Reveal delay={60}>
          <div className="mt-12 flex items-baseline justify-between gap-4 sm:mt-14">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-bone">
              Every format &amp; sleeve we press
            </h3>
            <span className="hidden text-[11px] text-muted sm:block">Tap to load into your quote</span>
          </div>
        </Reveal>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {config.vinylTypes.map((type, index) => {
            const active = configuration.vinylTypeId === type.id;
            const unit = type.unit[configuration.quantity];
            return (
              <Reveal key={type.id} delay={index * 60}>
                <button
                  type="button"
                  onClick={() => load(type.id, configuration.sleeveId)}
                  aria-pressed={active}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-all duration-300 ${
                    active
                      ? 'border-lime/60 bg-lime/[0.06]'
                      : 'border-white/[0.09] bg-black/20 hover:border-white/25 hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={`text-[13px] font-medium ${active ? 'text-lime' : 'text-bone'}`}>
                      {type.name}
                    </span>
                    <span className="num shrink-0 text-[12px] text-bone">
                      {unit ? usd(unit, { cents: true }) : '—'}
                    </span>
                  </div>
                  <span className="mt-1 block text-[11px] leading-snug text-muted">
                    {type.tagline} · {type.turnaround}
                  </span>
                  {type.badge && (
                    <span className="mt-2 inline-flex w-fit rounded-full border border-lime/25 bg-lime/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-lime">
                      {type.badge}
                    </span>
                  )}
                </button>
              </Reveal>
            );
          })}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {config.sleeves.map((sleeve, index) => {
            const active = configuration.sleeveId === sleeve.id;
            return (
              <Reveal key={sleeve.id} delay={index * 60}>
                <button
                  type="button"
                  onClick={() => load(configuration.vinylTypeId, sleeve.id)}
                  aria-pressed={active}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-all duration-300 ${
                    active
                      ? 'border-lime/60 bg-lime/[0.06]'
                      : 'border-white/[0.09] bg-black/20 hover:border-white/25 hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={`text-[13px] font-medium ${active ? 'text-lime' : 'text-bone'}`}>
                      {sleeve.name}
                    </span>
                    <span className="shrink-0 text-[10px] uppercase tracking-[0.1em] text-muted">
                      {sleeve.perUnit === 0 ? 'Included' : `+${usd(sleeve.perUnit, { cents: true })}/ea`}
                    </span>
                  </div>
                  <span className="mt-1 block text-[11px] leading-snug text-muted">{sleeve.description}</span>
                </button>
              </Reveal>
            );
          })}
        </div>

        <Reveal delay={120}>
          <p className="mt-5 flex items-start gap-2 text-[11px] leading-relaxed text-muted">
            <Icon name="shield" size={12} className="mt-0.5 shrink-0 text-lime" />
            Renders are representative: exact Pantone match is confirmed on the physical proof before we
            press, and artwork resubmission is free.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
