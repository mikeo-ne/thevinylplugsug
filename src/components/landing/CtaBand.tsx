import { Link } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import { Reveal } from '../ui/Reveal';
import { useDraft } from '../../store/DraftContext';
import { usd } from '../../lib/format';
import { whatsappUrl } from '../../lib/contact';

export function CtaBand() {
  const { quote } = useDraft();

  return (
    <section className="relative py-16 lg:py-24">
      <div className="container-x">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl bg-lime px-6 py-12 text-ink sm:px-10 lg:px-14 lg:py-16">
            <div
              className="pointer-events-none absolute -right-24 -top-24 h-[320px] w-[320px] rounded-full border border-ink/10"
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute -bottom-32 -left-16 h-[280px] w-[280px] rounded-full border border-ink/10"
              aria-hidden="true"
            />
            <div className="relative grid items-center gap-8 lg:grid-cols-[1.4fr_0.6fr]">
              <div>
                <div className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-ink/60">
                  <span className="h-1.5 w-1.5 rounded-full bg-ink" />
                  Your quote is ready to become a record
                </div>
                <h2 className="display max-w-xl text-balance text-[clamp(1.8rem,4vw,3rem)] font-semibold text-ink">
                  Lock your pressing slot for {usd(quote.total, { cents: true })}.
                </h2>
                <p className="mt-4 max-w-md text-[13.5px] leading-relaxed text-ink/70">
                  Q1 2027 factory slots are filling. Send your masters and artwork today and we'll
                  return a technical check within 24 hours.
                </p>
              </div>

              <div className="flex flex-col gap-2.5">
                <Link
                  to="/order"
                  className="group inline-flex items-center justify-center gap-2 rounded-full bg-ink px-6 py-4 text-sm font-semibold text-bone transition-all hover:bg-[#1d1d1d] hover:shadow-[0_18px_40px_-18px_rgba(0,0,0,0.6)]"
                >
                  Start your order
                  <Icon
                    name="arrow-right"
                    size={17}
                    strokeWidth={2}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
                <a
                  href={whatsappUrl()}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-ink/25 px-6 py-4 text-sm font-medium text-ink transition-colors hover:border-ink/50 hover:bg-ink/[0.06]"
                >
                  <Icon name="whatsapp" size={16} filled />
                  Book a call
                </a>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
