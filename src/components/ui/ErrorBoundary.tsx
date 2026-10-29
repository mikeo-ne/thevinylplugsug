import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Keeps a thrown render error from blanking the whole client portal. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[7h] Render error:', error);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="grid min-h-screen place-items-center px-5">
        <div className="panel max-w-md p-8 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-red-500/30 bg-red-500/10 text-red-300">
            !
          </div>
          <h1 className="mt-5 font-display text-xl font-semibold">Something skipped a groove</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            An unexpected error interrupted the page. Reload to continue — your quote and draft are
            saved for this session.
          </p>
          <button type="button" onClick={() => window.location.reload()} className="btn-lime mt-6">
            Reload the page
          </button>
        </div>
      </div>
    );
  }
}
