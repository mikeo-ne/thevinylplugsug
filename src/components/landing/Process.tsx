import { Reveal } from '../ui/Reveal';
import { Icon } from '../ui/Icon';

const steps = [
  {
    step: '01',
    title: 'Configure & quote',
    body: 'Pick your run size, format and packaging. The calculator shows the true factory cost, our 25% fee and your 50% deposit instantly.',
    meta: '~2 minutes',
  },
  {
    step: '02',
    title: 'Upload masters & artwork',
    body: 'Send 24-bit WAV masters and CMYK print-ready artwork. We run a free technical check — including a mastering review — before anything is sent on.',
    meta: '24-hour QC',
  },
  {
    step: '03',
    title: 'Deposit & proof approval',
    body: 'Pay 50% by MoMo, Airtel Money or card/SWIFT. The plant issues a digital proof; we only release the press once you sign it off in writing.',
    meta: 'Proof in 5–7 days',
  },
  {
    step: '04',
    title: 'Pressed, cleared & delivered',
    body: 'We manage production, freight, customs clearance and last-mile delivery to your Kampala address or an international tour city.',
    meta: '7–11 weeks',
  },
];

const guarantees = [
  {
    icon: 'shield' as const,
    title: 'Zero-risk production',
    body: 'No press starts without your written proof approval. If the plant deviates from the approved proof, the run is re-pressed at their cost.',
  },
  {
    icon: 'globe' as const,
    title: 'One broker, six plants',
    body: 'We negotiate directly with six plants across Europe and Asia, consolidate freight, and clear customs — you deal with one invoice and one WhatsApp thread.',
  },
  {
    icon: 'truck' as const,
    title: 'Landed-cost pricing',
    body: 'Freight to Kampala and customs brokerage are inside the quoted number. International tour-city delivery is quoted as a flat add-on.',
  },
];

export function Process() {
  return (
    <section id="process" className="relative scroll-mt-24 py-20 lg:py-28">
      <div className="container-x">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <Reveal>
              <div className="eyebrow eyebrow-dot mb-4">How it works</div>
              <h2 className="display max-w-sm text-balance text-[clamp(1.9rem,3.4vw,2.8rem)] font-semibold">
                From your master to a <span className="text-lime">shrink-wrapped</span> record.
              </h2>
              <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted">
                Four steps, one point of contact. We sit between you and the pressing plant so the
                spec sheet, the money and the freight all move together.
              </p>
              <a href="#configurator" className="btn-ghost mt-7">
                Start with a quote
                <Icon name="arrow-right" size={16} />
              </a>
            </Reveal>
          </div>

          <ol className="relative">
            <div className="absolute bottom-6 left-[19px] top-6 w-px bg-gradient-to-b from-lime/40 via-white/10 to-transparent" />
            {steps.map((step, index) => (
              <Reveal as="li" key={step.step} delay={index * 70} className="relative pb-8 pl-14 last:pb-0">
                <span className="absolute left-0 top-0 grid h-10 w-10 place-items-center rounded-full border border-white/12 bg-[#141413] font-mono text-[11px] text-lime">
                  {step.step}
                </span>
                <div className="card card-hover p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-[15px] font-medium text-bone">{step.title}</h3>
                    <span className="chip">{step.meta}</span>
                  </div>
                  <p className="mt-2.5 text-[13px] leading-relaxed text-muted">{step.body}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>

        <div className="mt-16 grid gap-4 md:grid-cols-3 lg:mt-24">
          {guarantees.map((item, index) => (
            <Reveal key={item.title} delay={index * 90}>
              <div className="card card-hover h-full p-6">
                <span className="grid h-10 w-10 place-items-center rounded-xl border border-lime/20 bg-lime/[0.08] text-lime">
                  <Icon name={item.icon} size={18} />
                </span>
                <h3 className="mt-5 text-[15px] font-medium text-bone">{item.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">{item.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
