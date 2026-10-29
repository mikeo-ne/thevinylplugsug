import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Logo } from '../ui/Logo';
import { Icon } from '../ui/Icon';

const links = [
  { label: 'Configurator', to: '/#configurator' },
  { label: 'Process', to: '/#process' },
  { label: 'Plants', to: '/#plants' },
  { label: 'FAQ', to: '/#faq' },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const location = useLocation();

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
                className="rounded-full px-3.5 py-2 text-[13px] font-medium text-muted transition-colors hover:text-bone"
              >
                {link.label}
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
          <a
            href="https://wa.me/256700411700"
            target="_blank"
            rel="noreferrer"
            className="hidden items-center gap-2 rounded-full border border-white/12 px-4 py-2.5 text-[13px] font-medium text-bone transition-colors hover:border-lime/40 hover:text-lime md:inline-flex"
          >
            <Icon name="whatsapp" size={15} filled />
            Talk to us
          </a>
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
