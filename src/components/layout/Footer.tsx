import { Link } from 'react-router-dom';
import { Logo } from '../ui/Logo';
import { Icon } from '../ui/Icon';
import { useConfig } from '../../hooks/useConfig';

export function Footer() {
  const { config } = useConfig();
  const company = config.company;

  return (
    <footer className="relative overflow-hidden border-t border-white/[0.07] bg-[#101010]">
      <div className="pointer-events-none absolute -bottom-40 left-1/2 h-[380px] w-[680px] -translate-x-1/2 rounded-full bg-lime/[0.05] blur-[120px]" />
      <div className="container-x relative py-14 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr_1fr_1.1fr]">
          <div>
            <Logo />
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-muted">
              Turnkey vinyl production and brokerage — pressed overseas, delivered to East Africa or
              your next tour city.
            </p>
            <div className="mt-6 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-muted">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime" />
              Accepting Q1 2027 pressing slots
            </div>
          </div>

          <div>
            <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-bone">Explore</h3>
            <ul className="space-y-2.5 text-sm text-muted">
              <li><a className="transition-colors hover:text-lime" href="/#configurator">Quote configurator</a></li>
              <li><a className="transition-colors hover:text-lime" href="/#process">How it works</a></li>
              <li><a className="transition-colors hover:text-lime" href="/#samples">Sample pressings</a></li>
              <li><a className="transition-colors hover:text-lime" href="/#plants">Pressing partners</a></li>
              <li><a className="transition-colors hover:text-lime" href="/#faq">FAQ</a></li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-bone">Client desk</h3>
            <ul className="space-y-2.5 text-sm text-muted">
              <li><Link className="transition-colors hover:text-lime" to="/order">Start an order</Link></li>
              <li><Link className="transition-colors hover:text-lime" to="/admin">Admin console</Link></li>
              <li><a className="transition-colors hover:text-lime" href={`mailto:${company.email}`}>File transfer help</a></li>
              <li><a className="transition-colors hover:text-lime" href={company.whatsapp}>WhatsApp desk</a></li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-bone">Studio</h3>
            <address className="space-y-2 text-sm not-italic text-muted">
              <p className="flex items-start gap-2.5">
                <Icon name="globe" size={15} className="mt-0.5 shrink-0 text-lime/70" />
                {company.location}
              </p>
              <p className="flex items-start gap-2.5">
                <Icon name="mail" size={15} className="mt-0.5 shrink-0 text-lime/70" />
                <a href={`mailto:${company.email}`} className="break-all transition-colors hover:text-lime">
                  {company.email}
                </a>
              </p>
              <p className="flex items-start gap-2.5">
                <Icon name="whatsapp" size={15} filled className="mt-0.5 shrink-0 text-lime/70" />
                <a href={company.whatsapp} className="transition-colors hover:text-lime">
                  {company.phone}
                </a>
              </p>
              <p className="pt-1 text-[11px] uppercase tracking-[0.14em] text-muted/70">{company.hours}</p>
            </address>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-white/[0.07] pt-6 text-[12px] text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} 7H Music Group Ltd. All rights reserved.</p>
          <p className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span>Production terms: 50% deposit &amp; proof approval</span>
            <span className="hidden h-3 w-px bg-white/15 sm:block" />
            <span>Prices indicative · FX locked at invoice</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
