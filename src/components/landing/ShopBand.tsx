import { Link } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import { Reveal } from '../ui/Reveal';
import { SLEEVES } from '../vinyl/sleeveArt';

/**
 * The bridge between the two halves of the business.
 *
 * A visiting artist hears "press your run"; a visiting fan hears "buy the
 * record". Same page has to sell both, so this band sits right after the sample
 * shelf and says, in one line, what the shop is for.
 */
export function ShopBand() {
  return (
    <section className="relative overflow-hidden border-t border-white/[0.06] py-14 sm:py-16">
      <div className="pointer-events-none absolute -right-24 top-1/2 h-[300px] w-[300px] -translate-y-1/2 rounded-full bg-lime/[0.07] blur-[100px]" />
      <div className="container-x relative">
        <Reveal>
          <div className="panel flex flex-col gap-6 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex -space-x-4">
                {SLEEVES.slice(0, 4).map((sleeve) => (
                  <img
                    key={sleeve.id}
                    src={sleeve.image}
                    alt=""
                    className="h-16 w-16 rounded-md border border-white/15 object-cover shadow-lg sm:h-20 sm:w-20"
                    loading="lazy"
                  />
                ))}
              </div>
              <div className="min-w-0">
                <div className="eyebrow eyebrow-dot mb-2">Just want the record?</div>
                <h2 className="display text-[clamp(1.35rem,2.6vw,1.9rem)] font-semibold">
                  The catalogue is <span className="text-lime">on sale now</span>.
                </h2>
                <p className="mt-1.5 max-w-md text-[12.5px] leading-relaxed text-muted">
                  Buy any pressing from stock — Kampala courier in 1–2 days, tracked shipping
                  worldwide. MoMo, Airtel Money or card.
                </p>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2.5">
              <Link to="/shop" className="btn-lime !px-5 !py-3 text-[12.5px]">
                Shop records
                <Icon name="arrow-right" size={14} />
              </Link>
              <a href="#configurator" className="btn-dark !px-5 !py-3 text-[12.5px]">
                Press your own
              </a>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
