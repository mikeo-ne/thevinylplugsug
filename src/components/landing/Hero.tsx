import { Link } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import { VinylDisc } from '../ui/VinylDisc';
import { useDraft } from '../../store/DraftContext';
import { usd, ugx } from '../../lib/format';
import { whatsappUrl } from '../../lib/contact';
import { useAnimatedNumber } from '../../hooks/useAnimatedNumber';

const stats = [
  { value: '1–1,000', label: 'Run sizes', detail: 'lathe cut to plant run' },
  { value: '7–11 wks', label: 'Factory turnaround', detail: 'after proof sign-off' },
  { value: '25%', label: 'All-in fee', detail: 'no hidden costs' },
  { value: '50%', label: 'Deposit', detail: 'balance on shipping' },
];

export function Hero() {
  const { quote, configuration } = useDraft();
  const animatedTotal = useAnimatedNumber(quote.total);
  const isSingle = configuration.vinylTypeId === 'seven_single';

  return (
    <section className="relative overflow-hidden pb-16 pt-32 sm:pt-36 lg:pb-24 lg:pt-44">
      {/* backdrop */}
      <div className="pointer-events-none absolute inset-0 grid-lines opacity-[0.5] [mask-image:radial-gradient(70%_60%_at_50%_10%,black,transparent)]" />
      <div className="pointer-events-none absolute -right-40 top-0 h-[620px] w-[620px] rounded-full bg-lime/[0.07] blur-[130px]" />
      <div className="pointer-events-none absolute -left-32 top-64 h-[420px] w-[420px] rounded-full bg-lime/[0.045] blur-[110px]" />

      <div className="container-x relative">
        <div className="grid items-center gap-10 sm:gap-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-8">
          <div className="min-w-0 animate-fade-up">
            <div className="eyebrow eyebrow-dot mb-7">
              Kampala brokerage · Overseas pressing
            </div>

            <h1 className="display text-balance text-[clamp(2.05rem,6vw,4.6rem)] font-semibold">
              Press Your Sound
              <br />
              on <span className="relative inline-block text-lime">
                Vinyl
                <svg
                  viewBox="0 0 240 12"
                  className="absolute -bottom-2 left-0 w-full text-lime/50"
                  fill="none"
                  aria-hidden="true"
                >
                  <path d="M2 8c48-5 96-6 144-4 30 1 62 3 92 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </span>
              .
              <br />
              <span className="text-bone/90">Zero Risk, Global Delivery.</span>
            </h1>

            <p className="mt-6 max-w-xl text-pretty text-[14.5px] leading-relaxed text-muted sm:mt-7 sm:text-base">
              Professional turnkey vinyl production and brokerage for East African and international
              artists, powered by 7H Music Group. We handle mastering review, plant negotiation,
              freight and customs — you approve the proof.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-2.5 sm:mt-9 sm:gap-3">
              <a
                href="#configurator"
                className="btn-lime group px-5 py-3 text-[13.5px] sm:px-6 sm:py-3.5 sm:text-sm"
              >
                Build your quote
                <Icon
                  name="arrow-right"
                  size={17}
                  strokeWidth={2}
                  className="transition-transform duration-300 group-hover:translate-x-0.5"
                />
              </a>
              <a
                href={whatsappUrl()}
                target="_blank"
                rel="noreferrer"
                className="btn-ghost px-5 py-3 text-[13.5px] sm:px-6 sm:py-3.5 sm:text-sm"
              >
                <Icon name="whatsapp" size={17} filled />
                Talk to a broker
              </a>
            </div>

            <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-6 border-t border-white/[0.07] pt-7 sm:mt-12 sm:grid-cols-4 sm:gap-y-7 sm:pt-8">
              {stats.map((stat) => (
                <div key={stat.label}>
                  <dt className="font-display text-[22px] font-semibold tracking-tight text-bone">
                    {stat.value}
                  </dt>
                  <dd className="mt-1.5 text-[11px] uppercase tracking-[0.14em] text-muted">
                    {stat.label}
                    <span className="mt-0.5 block text-[10px] normal-case tracking-normal text-muted/60">
                      {stat.detail}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* vinyl showcase */}
          <div className="relative mx-auto flex w-full min-w-0 max-w-[300px] items-center justify-center min-[420px]:max-w-[360px] sm:max-w-[440px] lg:max-w-none">
            <div className="absolute inset-0 rounded-full border border-white/[0.06]" />
            <div className="absolute inset-[12%] rounded-full border border-white/[0.05]" />
            <div className="absolute inset-[24%] rounded-full border border-lime/[0.08]" />

            <div className="relative w-full min-w-0 animate-float">
              <VinylDisc
                size={isSingle ? 340 : 460}
                label="7H"
                sublabel="VINYL"
                art={isSingle ? 'ekitibwa' : configuration.vinylTypeId === 'lp_standard' ? 'nalubaale' : 'amaka'}
                variant={isSingle ? 'seven' : configuration.vinylTypeId === 'lp_standard' ? 'standard' : 'colored'}
              />
            </div>

            {/* floating quote card */}
            <div className="absolute -bottom-2 -left-1 w-[158px] rounded-xl border border-white/10 bg-[#161615]/92 p-3 shadow-panel backdrop-blur-xl sm:left-2 sm:w-[196px] sm:rounded-2xl sm:p-4">
              <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-muted">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime" />
                Live quote
              </div>
              <div className="num mt-2 text-[21px] font-semibold leading-none text-bone sm:text-[26px]">
                {usd(animatedTotal)}
              </div>
              <div className="mt-1 text-[10px] text-muted sm:text-[11px]">{ugx(quote.totals.total.ugx)}</div>
              <div className="mt-3 flex items-center justify-between border-t border-white/[0.08] pt-2.5 text-[10px] text-muted">
                <span>{quote.quantity} units</span>
                <span>{usd(quote.perUnit, { cents: true })}/ea</span>
              </div>
            </div>

            {/* floating order chip */}
            <div className="absolute -top-1 right-0 hidden items-center gap-2.5 rounded-full border border-white/10 bg-[#161615]/90 px-3.5 py-2 text-[11px] text-bone shadow-panel backdrop-blur-xl sm:flex">
              <Icon name="check-circle" size={14} className="text-lime" />
              Deposit cleared · auto-sent to the plant
            </div>

            <div className="absolute bottom-16 right-0 hidden max-w-[150px] rounded-xl border border-white/[0.08] bg-[#161615]/80 p-3 text-[10px] leading-relaxed text-muted backdrop-blur-md sm:block">
              <Icon name="shield" size={13} className="mb-1.5 text-lime" />
              Proof approval required before the press starts.
            </div>
          </div>
        </div>

        <Link
          to="/order"
          className="mt-12 inline-flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.16em] text-muted transition-colors hover:text-lime lg:mt-16"
        >
          Skip to the order portal
          <Icon name="arrow-right" size={14} />
        </Link>
      </div>
    </section>
  );
}
