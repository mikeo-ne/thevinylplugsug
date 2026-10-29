import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useDraft } from '../../store/DraftContext';
import { useConfig } from '../../hooks/useConfig';
import { useAnimatedNumber } from '../../hooks/useAnimatedNumber';
import { Icon } from '../ui/Icon';
import { usd, ugx } from '../../lib/format';
import { VinylMockup } from '../vinyl/VinylMockup';
import { plantsForQuantity, plantSupportsQuantity, quantityTiers, quoteFor } from '../../lib/pricing';

const TIERS = new Map(quantityTiers.map((tier) => [tier.quantity, tier]));

function quantityTier(quantity: number) {
  return TIERS.get(quantity) ?? { quantity, name: 'units', note: '' };
}

function StepHeader({ index, title, hint }: { index: string; title: string; hint: string }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4">
      <h3 className="flex items-center gap-3 text-[15px] font-medium text-bone">
        <span className="font-mono text-[11px] tracking-widest text-lime">{index}</span>
        {title}
      </h3>
      <span className="text-right text-[11px] text-muted">{hint}</span>
    </div>
  );
}

export function Configurator() {
  const { configuration, setConfiguration, quote, fxRate, plantPreference, setPlantPreference } = useDraft();
  const { config } = useConfig();
  const animatedTotal = useAnimatedNumber(quote.total);
  const animatedFee = useAnimatedNumber(quote.managementFee);
  const animatedFactory = useAnimatedNumber(quote.factoryCost);

  // The next rung up the ladder — this is where the per-record saving is.
  const ladder = useMemo(() => {
    const next = quantityTiers.find((tier) => tier.quantity > configuration.quantity);
    if (!next) return null;
    const bigger = quoteFor({ ...configuration, quantity: next.quantity }, fxRate, plantPreference);
    const perRecord = Math.max(0, quote.perUnit - bigger.perUnit);
    return { next, perRecord, quantised: bigger.quantity };
  }, [configuration, quote.perUnit, fxRate, plantPreference]);

  const eligiblePlants = plantsForQuantity(configuration.quantity).length;


  return (
    <section id="configurator" className="relative scroll-mt-24 border-y border-white/[0.06] bg-[#0F0F0E] py-16 lg:py-24">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-lime/30 to-transparent" />
      <div className="container-x">
        <div className="mb-10 flex flex-col gap-5 lg:mb-14 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="eyebrow eyebrow-dot mb-4">Instant configurator</div>
            <h2 className="display max-w-xl text-balance text-[clamp(1.9rem,3.6vw,2.9rem)] font-semibold">
              Price your pressing in <span className="text-lime">30 seconds</span>.
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-muted">
            Every figure below is the real landed factory cost plus our flat 25% management fee.
            Nothing appears at checkout that you didn't see here.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:gap-8">
          {/* ---------------- options ---------------- */}
          <div className="space-y-8">
            {/* quantity */}
            <div className="panel p-5 sm:p-6">
              <StepHeader
                index="01"
                title="Quantity"
                hint="1 lathe cut → 1,000-unit plant run"
              />
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-2.5 xl:grid-cols-7">
                {config.quantities.map((quantity) => {
                  const tier = quantityTier(quantity);
                  const active = configuration.quantity === quantity;
                  const unit = quote.vinylType.unit[quantity];
                  return (
                    <button
                      key={quantity}
                      type="button"
                      aria-pressed={active}
                      aria-label={`${quantity.toLocaleString('en-US')} units — ${tier.name}`}
                      onClick={() => setConfiguration({ quantity })}
                      className={`group relative overflow-hidden rounded-xl border px-1.5 py-3 text-center transition-all duration-300 sm:px-2 sm:py-4 ${
                        active
                          ? 'border-lime bg-lime/[0.09] shadow-[0_0_0_1px_rgba(204,255,0,0.4),0_16px_40px_-24px_rgba(204,255,0,0.7)]'
                          : 'border-white/10 bg-black/20 hover:border-white/25 hover:bg-white/[0.03]'
                      }`}
                    >
                      <span
                        className={`num block text-[20px] font-semibold leading-none transition-colors sm:text-[23px] ${
                          active ? 'text-lime' : 'text-bone'
                        }`}
                      >
                        {quantity.toLocaleString('en-US')}
                      </span>
                      <span className="mt-1.5 block text-[9px] uppercase tracking-[0.1em] text-muted">
                        {tier.name}
                      </span>
                      <span className="mt-2 block text-[10.5px] text-muted">
                        {unit ? `${usd(unit, { cents: true })}/ea` : '—'}
                      </span>
                      {quantity === 250 && (
                        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-lime" aria-hidden="true" />
                      )}
                      {active && (
                        <span className="absolute inset-x-2 bottom-0 h-px animate-[bar-grow_0.5s_ease-out] bg-lime/60" />
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-muted">
                {quote.quantity === 1 ? (
                  <>
                    A single lathe cut is pressed one record at a time and ships from{' '}
                    <span className="text-bone">{quote.plant.name}</span> — no plates, no minimum.
                  </>
                ) : (
                  <>
                    Per-unit price falls as the run grows: a 25-unit micro-run pays for plates it can
                    never amortise, a 1,000-unit plant run gets the factory&apos;s best rate.
                  </>
                )}
              </p>
            </div>

            {/* vinyl type */}
            <div className="panel p-5 sm:p-6">
              <StepHeader index="02" title="Vinyl size & type" hint={`Quoted at ${quote.plant.name}`} />
              <div className="space-y-2.5">
                {config.vinylTypes.map((type) => {
                  const active = configuration.vinylTypeId === type.id;
                  const unit = type.unit[configuration.quantity];
                  return (
                    <button
                      key={type.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setConfiguration({ vinylTypeId: type.id })}
                      className={`flex w-full items-center gap-4 rounded-xl border px-3.5 py-3.5 text-left transition-all duration-300 sm:px-4 ${
                        active
                          ? 'border-lime/60 bg-lime/[0.06]'
                          : 'border-white/[0.09] bg-black/20 hover:border-white/25 hover:bg-white/[0.03]'
                      }`}
                    >
                      <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full">
                        <span
                          className="absolute inset-0 rounded-full border"
                          style={{
                            borderColor: active ? 'rgba(204,255,0,0.55)' : 'rgba(255,255,255,0.14)',
                            background:
                              type.id === 'lp_colored'
                                ? 'conic-gradient(from 120deg, #CCFF00, #7CB800, #DFFF66, #9BD400, #CCFF00)'
                                : type.id === 'lp_standard'
                                  ? 'conic-gradient(from 210deg, #0a0a0a, #2a2a27, #0b0b0b, #26262a, #0a0a0a)'
                                  : 'conic-gradient(from 210deg, #111, #2a2a27, #111, #232323, #111)',
                          }}
                        />
                        <span
                          className="relative rounded-full bg-ink"
                          style={{ width: type.id === 'seven_single' ? 5 : 7, height: type.id === 'seven_single' ? 5 : 7 }}
                        />
                        {type.badge && (
                          <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-lime ring-2 ring-[#161615]" />
                        )}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className={`text-sm font-medium ${active ? 'text-lime' : 'text-bone'}`}>
                            {type.name}
                          </span>
                          {type.badge && (
                            <span className="rounded-full border border-lime/25 bg-lime/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-lime">
                              {type.badge}
                            </span>
                          )}
                        </span>
                        <span className="mt-1 block text-[11.5px] leading-snug text-muted">
                          {type.tagline} · {type.turnaround}
                        </span>
                      </span>

                      <span className="shrink-0 text-right">
                        <span className="num block text-sm font-medium text-bone">
                          {unit ? `${usd(unit, { cents: true })}` : '—'}
                        </span>
                        <span className="block text-[10px] uppercase tracking-[0.1em] text-muted">per unit</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* sleeves */}
            <div className="panel p-5 sm:p-6">
              <StepHeader index="03" title="Sleeve & packaging" hint="Artwork must be CMYK print-ready" />
              <div className="grid gap-2.5 sm:grid-cols-3">
                {config.sleeves.map((sleeve) => {
                  const active = configuration.sleeveId === sleeve.id;
                  return (
                    <button
                      key={sleeve.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setConfiguration({ sleeveId: sleeve.id })}
                      className={`group rounded-xl border p-3.5 text-left transition-all duration-300 ${
                        active
                          ? 'border-lime/60 bg-lime/[0.06]'
                          : 'border-white/[0.09] bg-black/20 hover:border-white/25 hover:bg-white/[0.03]'
                      }`}
                    >
                      <span className="mb-3 flex items-center justify-between">
                        <span
                          className={`grid h-6 w-6 place-items-center rounded-full border transition-colors ${
                            active ? 'border-lime bg-lime text-ink' : 'border-white/20 text-transparent'
                          }`}
                        >
                          <Icon name="check" size={12} strokeWidth={3} />
                        </span>
                        <span className="text-[10px] uppercase tracking-[0.1em] text-muted">
                          {sleeve.perUnit === 0 ? 'Included' : `+${usd(sleeve.perUnit, { cents: true })}/ea`}
                        </span>
                      </span>
                      <span className={`block text-[13px] font-medium ${active ? 'text-lime' : 'text-bone'}`}>
                        {sleeve.name}
                      </span>
                      <span className="mt-1 block text-[11px] leading-snug text-muted">{sleeve.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* plant / supplier */}
            <div className="panel p-5 sm:p-6">
              <StepHeader
                index="04"
                title="Plant / supplier"
                hint={`${eligiblePlants} of ${config.plants.length} take this run`}
              />

              <div className="relative">
                <label htmlFor="plant-select" className="sr-only">
                  Pressing plant
                </label>
                <select
                  id="plant-select"
                  className="field dark-select pr-10"
                  value={quote.plant.id}
                  onChange={(event) => setPlantPreference(event.target.value)}
                >
                  {config.plants.map((plant) => {
                    const eligible = plantSupportsQuantity(plant, configuration.quantity);
                    return (
                      <option key={plant.id} value={plant.id} disabled={!eligible} className="bg-[#161615]">
                        {plant.name} — {plant.region} (MOQ {plant.moq}){eligible ? '' : ' · not available for this run'}
                      </option>
                    );
                  })}
                </select>
                <Icon
                  name="chevron-down"
                  size={15}
                  className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted"
                />
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <PlantFact label="Minimum run" value={`${quote.plant.moq} units`} />
                <PlantFact label="Factory lead time" value={quote.plant.leadTime} />
                <PlantFact
                  label="Rate card"
                  value={
                    quote.plant.priceFactor === 1
                      ? 'Base rate'
                      : `${quote.plant.priceFactor > 1 ? '+' : '−'}${Math.round(
                          Math.abs(quote.plant.priceFactor - 1) * 100,
                        )}% vs base`
                  }
                />
              </div>

              <p className="mt-3 flex items-start gap-2 text-[11.5px] leading-relaxed text-muted">
                <Icon name="factory" size={14} className="mt-0.5 shrink-0 text-lime/80" />
                <span>
                  {quote.plant.note}
                  {quote.plant.id !== plantPreference && (
                    <> Switched to {quote.plant.name} because your previous plant can&apos;t take this run.</>
                  )}
                </span>
              </p>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5">
              <Icon name="bolt" size={16} className="mt-0.5 shrink-0 text-lime" />
              <p className="text-[12px] leading-relaxed text-muted">
                {ladder && ladder.perRecord > 0.05 ? (
                  <>
                    Move to{' '}
                    <span className="font-medium text-bone">
                      {ladder.next.quantity.toLocaleString('en-US')} units
                    </span>{' '}
                    ({ladder.next.name.toLowerCase()}) and the all-in price drops{' '}
                    <span className="font-medium text-lime">
                      {usd(ladder.perRecord, { cents: true })}
                    </span>{' '}
                    per record — the 25% fee stays the same.
                  </>
                ) : (
                  <>
                    You&apos;re on the best rate we can quote: the factory&apos;s 1,000-unit plant run. Only
                    the 25% management fee sits on top.
                  </>
                )}
              </p>
            </div>
          </div>

          {/* ---------------- quote panel ---------------- */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="panel relative overflow-hidden">
              <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-lime/10 blur-3xl" />
              <div className="relative p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="eyebrow mb-2">Turnkey quote</div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-[22px] font-light text-muted">$</span>
                      <span className="num text-[42px] font-semibold leading-none text-bone sm:text-[52px]">
                        {Math.round(animatedTotal).toLocaleString('en-US')}
                      </span>
                    </div>
                    <div className="mt-2 text-[13px] text-muted">
                      ≈ {ugx(quote.totals.total.ugx)}
                    </div>
                  </div>
                  <div className="hidden w-[132px] shrink-0 sm:block">
                    <VinylMockup
                      vinylTypeId={configuration.vinylTypeId}
                      sleeveId={configuration.sleeveId}
                      className="aspect-[384/300] w-full"
                    />
                    <div className="mt-1 text-center text-[9px] uppercase tracking-[0.14em] text-muted">
                      Your build
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="chip border-lime/25 bg-lime/[0.08] text-lime-soft">
                    {quote.quantity} units
                  </span>
                  <span className="chip">{quote.vinylType.shortName}</span>
                  <span className="chip">{quote.sleeve.shortName}</span>
                  <span className="chip">{quote.plant.name}</span>
                  <span className="chip">{usd(quote.perUnit, { cents: true })}/ea</span>
                </div>

                <div className="my-5 h-px bg-gradient-to-r from-white/10 via-white/[0.07] to-transparent" />

                <dl className="space-y-2.5 text-[13px]">
                  <Row
                    label={`Pressing · ${quote.quantity} × ${usd(quote.lines.unitPrice, { cents: true })}`}
                    value={usd(quote.lines.pressingCost, { cents: true })}
                  />
                  {quote.lines.sleeveCost > 0 && (
                    <Row
                      label={`Sleeve upgrade · ${quote.quantity} × ${usd(quote.lines.sleevePerUnit, { cents: true })}`}
                      value={usd(quote.lines.sleeveCost, { cents: true })}
                    />
                  )}
                  {quote.lines.setupCost > 0 && (
                    <Row label="Factory setup, plates & test press" value={usd(quote.lines.setupCost, { cents: true })} />
                  )}
                  {Math.abs(quote.lines.plantAdjustment) >= 0.01 && (
                    <Row
                      label={`${quote.plant.name} rate card`}
                      value={`${quote.lines.plantAdjustment > 0 ? '+' : '−'}${usd(
                        Math.abs(quote.lines.plantAdjustment),
                        { cents: true },
                      )}`}
                    />
                  )}
                  <div className="my-2.5 h-px bg-white/[0.07]" />
                  <Row
                    label="Total factory cost"
                    value={usd(animatedFactory, { cents: true })}
                    strong
                  />
                  <Row
                    label="7H management fee · 25%"
                    value={usd(animatedFee, { cents: true })}
                    accent
                  />
                  <div className="my-2.5 h-px bg-white/[0.07]" />
                  <div className="flex items-baseline justify-between pt-0.5">
                    <dt className="text-[12px] font-medium uppercase tracking-[0.14em] text-bone">Turnkey total</dt>
                    <dd className="text-right">
                      <span className="num block text-[19px] font-semibold text-lime">
                        {usd(quote.total, { cents: true })}
                      </span>
                      <span className="block text-[11px] text-muted">{ugx(quote.totals.total.ugx)}</span>
                    </dd>
                  </div>
                </dl>

                <div className="mt-5 rounded-xl border border-lime/25 bg-lime/[0.07] p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-lime">
                        Deposit to start · 50%
                      </div>
                      <div className="num mt-1.5 text-[24px] font-semibold leading-none text-bone">
                        {usd(quote.deposit, { cents: true })}
                      </div>
                      <div className="mt-1 text-[11px] text-muted">
                        {ugx(quote.totals.deposit.ugx)} · balance on dispatch
                      </div>
                    </div>
                    <Icon name="lock" size={18} className="shrink-0 text-lime/70" />
                  </div>
                </div>

                <Link to="/order" className="btn-lime group mt-4 w-full">
                  Continue to order portal
                  <Icon
                    name="arrow-right"
                    size={17}
                    strokeWidth={2}
                    className="transition-transform duration-300 group-hover:translate-x-0.5"
                  />
                </Link>

                <p className="mt-3.5 text-center text-[10.5px] leading-relaxed text-muted">
                  Includes freight to Kampala &amp; customs brokerage. FX indicative at{' '}
                  {fxRate.toLocaleString('en-US')} UGX/USD, locked at invoice.
                </p>
              </div>
            </div>

            <ul className="mt-4 grid gap-2 text-[11.5px] text-muted">
              {[
                'Proof approval before pressing — no silent runs',
                'Mastering review included on every order',
                'Deposit held until test press is signed off',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Icon name="check" size={13} className="mt-0.5 shrink-0 text-lime" strokeWidth={2.5} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function PlantFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-black/25 px-3 py-2">
      <span className="block text-[9.5px] uppercase tracking-[0.13em] text-muted">{label}</span>
      <span className="mt-0.5 block text-[12px] text-bone">{value}</span>
    </div>
  );
}

function Row({
  label,
  value,
  strong = false,
  accent = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={`${strong ? 'text-bone' : accent ? 'text-lime/90' : 'text-muted'}`}>{label}</dt>
      <dd
        className={`num shrink-0 tabular-nums ${
          strong ? 'text-bone' : accent ? 'text-lime/90' : 'text-bone/80'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
