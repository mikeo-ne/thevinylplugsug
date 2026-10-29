import { Link } from 'react-router-dom';
import { Icon } from '../components/ui/Icon';

export function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center px-5 pt-24">
      <div className="text-center">
        <div className="font-display text-[88px] font-semibold leading-none tracking-tightest text-white/[0.08]">
          404
        </div>
        <h1 className="mt-2 font-display text-2xl font-semibold">This groove is empty</h1>
        <p className="mx-auto mt-2 max-w-sm text-[13px] text-muted">
          The page you're looking for has spun off. Head back to the configurator and price your pressing.
        </p>
        <Link to="/" className="btn-lime mt-7">
          Back to home
          <Icon name="arrow-right" size={16} />
        </Link>
      </div>
    </main>
  );
}
