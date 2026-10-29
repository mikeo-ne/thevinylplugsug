import { Reveal } from '../ui/Reveal';
import { Icon } from '../ui/Icon';

const plants = [
  {
    id: 'mobineko',
    name: 'Mobineko',
    region: 'Taiwan · worldwide fulfilment',
    blurb:
      'Our primary partner for colour vinyl and gatefold work. Known for tight tolerances, immaculate print and reliable dispatch to East Africa.',
    specs: ['140g & 180g black', 'Colour / splatter runs', 'Gatefold & inner sleeves', 'Consolidated air freight'],
    lead: '9–11 weeks',
  },
  {
    id: 'greenlakes',
    name: 'Green Lakes Pressing',
    region: 'Lithuania · EU eco vinyl specialists',
    blurb:
      'Our EU partner for eco-conscious releases: recycled compound vinyl, bio-wrap and dispatch into Europe or consolidated on to Kampala.',
    specs: ['Recycled eco vinyl', 'Bio-degradable wrap', 'Direct EU dispatch', 'Short-run friendly'],
    lead: '7–10 weeks',
  },
];

const audiences = [
  { title: 'Independent artists', body: 'Your first physical release without a label advance.', icon: 'music' as const },
  { title: 'Record labels', body: 'Repeat runs, catalogue reissues, consistent specs.', icon: 'printer' as const },
  { title: 'DJs & selectors', body: '7" club singles and limited dubplate-style runs.', icon: 'bolt' as const },
  { title: 'Collectors & shops', body: 'Numbered colour variants with verified provenance.', icon: 'sparkle' as const },
];

export function Plants() {
  return (
    <section id="plants" className="relative scroll-mt-24 border-y border-white/[0.06] bg-[#0F0F0E] py-20 lg:py-28">
      <div className="container-x">
        <Reveal>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="eyebrow eyebrow-dot mb-4">Brokerage network</div>
              <h2 className="display max-w-xl text-balance text-[clamp(1.9rem,3.4vw,2.8rem)] font-semibold">
                We press with the plants that <span className="text-lime">actually deliver</span>.
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-muted">
              7H holds the relationships, the spec sheets and the freight accounts. You get factory
              pricing without the factory correspondence.
            </p>
          </div>
        </Reveal>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {plants.map((plant, index) => (
            <Reveal key={plant.id} delay={index * 90}>
              <article className="group relative h-full overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.05] to-transparent p-6 transition-all duration-500 hover:border-lime/30 sm:p-7">
                <div className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-lime/[0.06] blur-3xl transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-muted">{plant.region}</div>
                    <h3 className="mt-2 font-display text-[26px] font-semibold tracking-tight text-bone">
                      {plant.name}
                    </h3>
                  </div>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/10 text-lime">
                    <Icon name="factory" size={19} />
                  </span>
                </div>
                <p className="relative mt-4 text-[13px] leading-relaxed text-muted">{plant.blurb}</p>
                <ul className="relative mt-5 grid grid-cols-2 gap-2">
                  {plant.specs.map((spec) => (
                    <li key={spec} className="flex items-start gap-2 text-[11.5px] text-bone/80">
                      <Icon name="check" size={12} strokeWidth={2.6} className="mt-0.5 shrink-0 text-lime" />
                      {spec}
                    </li>
                  ))}
                </ul>
                <div className="relative mt-6 flex items-center justify-between border-t border-white/[0.08] pt-4 text-[11px]">
                  <span className="uppercase tracking-[0.16em] text-muted">Lead time</span>
                  <span className="num text-bone">{plant.lead}</span>
                </div>
              </article>
            </Reveal>
          ))}
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {audiences.map((audience, index) => (
            <Reveal key={audience.title} delay={index * 70}>
              <div className="card card-hover flex h-full items-start gap-3 p-5">
                <span className="mt-0.5 shrink-0 text-lime">
                  <Icon name={audience.icon} size={17} />
                </span>
                <div>
                  <h3 className="text-[13px] font-medium text-bone">{audience.title}</h3>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{audience.body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
