import { Reveal } from '../ui/Reveal';
import { Icon } from '../ui/Icon';

const pressings = [
  {
    artist: 'Naledi Sound',
    title: 'Sunbird',
    cat: '7H-2026-8K2Q',
    format: '12" Colored · Gatefold',
    run: '250 units',
    city: 'Kampala, UG',
    cover: 'sunbird',
  },
  {
    artist: 'Kampala Nights',
    title: 'Vol. I',
    cat: '7H-2026-3Z7M',
    format: '12" LP · Printed inner',
    run: '500 units',
    city: 'London, UK',
    cover: 'rings',
  },
  {
    artist: '7H Sampler',
    title: 'Lime Series',
    cat: '7H-2026-04LP',
    format: '7" Single · Standard jacket',
    run: '100 units',
    city: 'Nairobi, KE',
    cover: 'type',
  },
];

export function RecentPressings() {
  return (
    <section className="relative border-t border-white/[0.06] py-20 lg:py-24">
      <div className="container-x">
        <Reveal>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="eyebrow eyebrow-dot mb-4">Recent pressings</div>
              <h2 className="display max-w-lg text-balance text-[clamp(1.9rem,3.4vw,2.8rem)] font-semibold">
                Runs we brokered, <span className="text-lime">start to shrink-wrap</span>.
              </h2>
            </div>
            <p className="max-w-xs text-[13px] leading-relaxed text-muted">
              Every job below went through the same pipeline you're about to use: quote, technical
              check, deposit, proof, press, freight.
            </p>
          </div>
        </Reveal>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {pressings.map((item, index) => (
            <Reveal key={item.cat} delay={index * 90}>
              <article className="group">
                <div className="relative aspect-square overflow-hidden rounded-2xl border border-white/[0.09] grain">
                  <Cover variant={item.cover} artist={item.artist} title={item.title} cat={item.cat} />
                  <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/[0.06] transition-all duration-500 group-hover:ring-lime/30" />
                  <span className="absolute left-3 top-3 rounded-full bg-black/40 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-bone/80 backdrop-blur-sm">
                    {item.run}
                  </span>
                </div>

                <div className="mt-3.5 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-[13.5px] font-medium text-bone">{item.artist}</h3>
                    <p className="text-[11.5px] text-muted">{item.format}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-[10.5px] text-muted">
                    <Icon name="globe" size={11} className="text-lime/60" />
                    {item.city}
                  </span>
                </div>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal delay={120}>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
            <p className="flex items-center gap-2 text-[11.5px] text-muted">
              <Icon name="bolt" size={13} className="text-lime" />
              Average broker-to-doorstep time this year: 9 weeks 4 days.
            </p>
            <a
              href="#configurator"
              className="flex items-center gap-1.5 text-[11.5px] font-medium text-lime transition-opacity hover:opacity-80"
            >
              Price your own run
              <Icon name="arrow-right" size={13} />
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Cover({
  variant,
  artist,
  title,
  cat,
}: {
  variant: string;
  artist: string;
  title: string;
  cat: string;
}) {
  if (variant === 'sunbird') {
    return (
      <div className="absolute inset-0" style={{ background: 'linear-gradient(150deg,#10100f 20%,#26200f 62%,#6a5a10 100%)' }}>
        <div
          className="absolute -right-10 top-10 h-[78%] w-[78%] rounded-full"
          style={{
            background: 'conic-gradient(from 200deg,#CCFF00,#93c400 38%,#DFFF66 62%,#7fae00 100%)',
            filter: 'blur(0.2px)',
            boxShadow: '0 0 80px rgba(204,255,0,0.28)',
          }}
        />
        <div className="absolute -right-4 top-16 h-[62%] w-[62%] rounded-full border border-ink/20" />
        <div className="absolute inset-x-5 top-5">
          <div className="text-[8px] uppercase tracking-[0.28em] text-bone/50">7H Music Group</div>
          <div className="mt-1 font-display text-[clamp(1.5rem,4vw,2rem)] font-semibold leading-[0.95] text-bone">
            {artist}
            <span className="block text-lime">{title}</span>
          </div>
        </div>
        <div className="absolute inset-x-5 bottom-4 flex items-end justify-between text-[8px] uppercase tracking-[0.18em] text-bone/45">
          <span>{cat}</span>
          <span>Side A / 33⅓</span>
        </div>
      </div>
    );
  }

  if (variant === 'rings') {
    return (
      <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 110% at 20% 15%,#1d2b30 0%,#0d1416 55%,#080a0b 100%)' }}>
        {[42, 34, 26, 18].map((size) => (
          <div
            key={size}
            className="absolute rounded-full border border-lime/20"
            style={{
              width: `${size * 2}%`,
              height: `${size * 2}%`,
              left: '50%',
              top: '50%',
              transform: 'translate(-50%,-50%)',
            }}
          />
        ))}
        <div
          className="absolute left-1/2 top-1/2 h-[30%] w-[30%] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: 'radial-gradient(circle at 35% 30%,#DFFF66,#8fbc00 70%)' }}
        />
        <div className="absolute inset-x-5 top-5">
          <div className="text-[8px] uppercase tracking-[0.28em] text-lime/60">Limited pressing</div>
          <div className="mt-1 font-display text-[clamp(1.5rem,4vw,2rem)] font-semibold uppercase leading-[0.95] tracking-tight text-bone">
            {artist}
            <span className="block text-[0.46em] font-normal tracking-[0.34em] text-bone/60">{title}</span>
          </div>
        </div>
        <div className="absolute inset-x-5 bottom-4 flex items-end justify-between text-[8px] uppercase tracking-[0.18em] text-bone/40">
          <span>{cat}</span>
          <span>Gatefold</span>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 bg-lime">
      <div className="absolute inset-0 bg-[radial-gradient(90%_70%_at_85%_10%,rgba(255,255,255,0.5),transparent_60%)]" />
      <div
        className="absolute -bottom-14 -right-14 h-[62%] w-[62%] rounded-full border-[14px] border-ink/85"
        style={{ background: 'conic-gradient(from 40deg,#121212,#2a2a26,#121212,#232320,#121212)' }}
      />
      <div className="absolute inset-x-5 top-5">
        <div className="text-[8px] uppercase tracking-[0.28em] text-ink/50">7" club series</div>
        <div className="mt-1 font-display text-[clamp(1.6rem,4.4vw,2.2rem)] font-bold leading-[0.9] tracking-tightest text-ink">
          7H
          <span className="block">{title}</span>
        </div>
      </div>
      <div className="absolute inset-x-5 bottom-4 flex items-end justify-between text-[8px] font-semibold uppercase tracking-[0.18em] text-ink/55">
        <span>{cat}</span>
        <span>45 rpm</span>
      </div>
    </div>
  );
}
