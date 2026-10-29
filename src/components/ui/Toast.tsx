import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Icon } from './Icon';

type Tone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  tone: Tone;
}

interface ToastContextValue {
  notify: (message: string, tone?: Tone) => void;
}

const ToastContext = createContext<ToastContextValue>({ notify: () => {} });

let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((message: string, tone: Tone = 'info') => {
    const id = ++counter;
    setToasts((prev) => [...prev.slice(-2), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 4200);
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[90] flex flex-col items-center gap-2 px-4 sm:bottom-7">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex w-full max-w-sm animate-fade-up items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-panel backdrop-blur-xl ${
              toast.tone === 'error'
                ? 'border-red-500/30 bg-red-950/80 text-red-100'
                : toast.tone === 'success'
                  ? 'border-lime/30 bg-[#1c2210]/95 text-lime-soft'
                  : 'border-white/15 bg-[#1a1a19]/95 text-bone'
            }`}
          >
            <Icon
              name={toast.tone === 'error' ? 'alert' : toast.tone === 'success' ? 'check-circle' : 'bolt'}
              size={17}
              className="mt-0.5 shrink-0"
            />
            <span className="leading-snug">{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
