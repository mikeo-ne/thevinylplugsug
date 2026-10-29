import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Logo } from '../ui/Logo';
import { Icon } from '../ui/Icon';
import { whatsappUrl } from '../../lib/contact';
import { useBag } from '../../store/BagContext';
import { CurrencySwitch } from './CurrencySwitch';

const links = [
  { label: 'Shop', to: '/shop' },
  { label: 'Configurator', to: '/#configurator' },
  { label: 'Process', to: '/#process' },
  { label: 'Plants', to: '/#plants' },
  { label: 'FAQ', to: '/#faq' },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { count } = useBag();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 18);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.hash]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled || open
          ? 'border-b border-white/[0.07] bg-ink/85 backdrop-blur-xl'
          : 'border-b border-transparent bg-transparent'
      }`}
    >
      <div className="container-x flex h-[72px] items-center justify-between gap-6">
        <Logo />

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {links.map((link) =>
            link.to.includes('#') ? (
              <a
                key={link.label}
                href={link.to}
                className="rounded-full px-3.5 py-2 text-[13px] font-medium text-muted transition-colors hover:text-bone"
              >
                {link.label}
              </a>
            ) : (
              <NavLink
                key={link.label}
                to={link.to}
                className={({ isActive }) =>
                  `rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors ${
                    isActive ? 'text-lime' : 'text-muted hover:text-bone'
                  }`
                }
              >
                {link.label}
                {link.to === '/shop' && count > 0 && (
                  <span className="ml-1.5 inline-grid h-4 min-w-4 place-items-center rounded-full bg-lime px-1 text-[9px] font-bold text-ink">
                    {count}
                  </span>
                )}
              </NavLink>
            ),
          )}
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors ${
                isActive ? 'text-lime' : 'text-muted hover:text-bone'
              }`
            }
          >
            Admin
          </NavLink>
        </nav>

        <div className="flex items-center gap-2.5">
          <div className="hidden sm:block">
            <CurrencySwitch />
          </div>
          <a
            href={whatsappUrl()}
            target="_blank"
            rel="noreferrer"
            aria-label="Talk to us on WhatsApp"
            className="hidden h-10 w-10 place-items-center rounded-full border border-white/12 text-bone transition-colors hover:border-lime/40 hover:text-lime md:grid"
          >
            <Icon name="whatsapp" size={16} filled />
          </a>
          <Link
            to="/shop#checkout"
            aria-label={`Your bag — ${count} record${count === 1 ? '' : 's'}`}
            className="relative grid h-10 w-10 place-items-center rounded-full border border-white/12 text-bone transition-colors hover:border-lime/40 hover:text-lime"
          >
            <Icon name="music" size={16} />
            {count > 0 && (
              <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-lime px-1 text-[9px] font-bold text-ink">
                {count}
              </span>
            )}
          </Link>
          <Link
            to="/order"
            className="inline-flex items-center gap-2 rounded-full bg-lime px-5 py-2.5 text-[13px] font-semibold text-ink transition-all hover:bg-lime-soft hover:shadow-[0_0_28px_rgba(204,255,0,0.35)]"
          >
            Start order
            <Icon name="arrow-right" size={15} strokeWidth={2} />
          </Link>
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            className="grid h-10 w-10 place-items-center rounded-full border border-white/12 text-bone transition-colors hover:border-lime/40 lg:hidden"
          >
            <Icon name={open ? 'x' : 'menu'} size={18} />
          </button>
        </div>
      </div>

      <div
        className={`overflow-hidden border-t border-white/[0.06] bg-ink/95 transition-all duration-300 lg:hidden ${
          open ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <nav className="container-x flex flex-col py-3" aria-label="Mobile">
          <div className="flex items-center justify-between border-b border-white/[0.05] py-3 sm:hidden">
            <span className="text-[11px] uppercase tracking-[0.14em] text-muted">Currency</span>
            <CurrencySwitch compact />
          </div>
          {[...links, { label: 'Admin console', to: '/admin' }].map((link) => (
            <a
              key={link.label}
              href={link.to}
              className="flex items-center justify-between border-b border-white/[0.05] py-3.5 text-sm text-bone last:border-none"
            >
              {link.label}
              <Icon name="chevron-right" size={16} className="text-muted" />
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
